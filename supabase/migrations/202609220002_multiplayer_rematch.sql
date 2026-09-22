alter table public.games
  add column match_number integer not null default 1 check (match_number > 0),
  add column starting_seat smallint not null default 1 check (starting_seat in (1, 2));

create table public.game_match_results (
  game_id uuid not null references public.games(id) on delete cascade,
  match_number integer not null check (match_number > 0),
  player_1_id uuid not null references public.players(id) on delete cascade,
  player_1_score smallint not null check (player_1_score >= 0),
  player_2_id uuid not null references public.players(id) on delete cascade,
  player_2_score smallint not null check (player_2_score >= 0),
  winner_id uuid references public.players(id) on delete set null,
  rounds_played smallint not null check (rounds_played > 0),
  completed_at timestamptz not null default now(),
  primary key (game_id, match_number)
);

create table public.rematch_requests (
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '60 seconds'),
  primary key (game_id, player_id),
  foreign key (game_id, player_id) references public.game_players(game_id, player_id) on delete cascade
);

alter table public.game_match_results enable row level security;
alter table public.rematch_requests enable row level security;
revoke all on public.game_match_results, public.rematch_requests from anon, authenticated;
grant select on public.game_match_results, public.rematch_requests to authenticated;
create policy "members can read match results"
  on public.game_match_results for select to authenticated using (public.is_game_member(game_id));
create policy "members can read rematch requests"
  on public.rematch_requests for select to authenticated using (public.is_game_member(game_id));

create or replace function public.start_game(target_game_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare hand_size integer; first_player uuid; second_player uuid; first_seat smallint;
begin
  select (g.rules->>'handSize')::integer,g.starting_seat into hand_size,first_seat
  from public.games g where g.id=target_game_id for update;
  if (select count(*) from public.game_players gp where gp.game_id=target_game_id)<>2 then raise exception 'PLAYERS_NOT_READY'; end if;
  if (select count(*) from public.card_definitions c where c.enabled and c.kind='astronomical' and exists(select 1 from public.card_images ci where ci.card_id=c.id and ci.enabled))<hand_size*2 then raise exception 'INSUFFICIENT_CARDS'; end if;
  if exists(select 1 from public.game_cards gc where gc.game_id=target_game_id) then return; end if;
  select gp.player_id into first_player from public.game_players gp where gp.game_id=target_game_id and gp.seat=first_seat;
  select gp.player_id into second_player from public.game_players gp where gp.game_id=target_game_id and gp.seat<>first_seat;
  insert into public.game_cards(game_id,card_id,player_id,hand_position,image_id)
  select target_game_id,picked.id,
    case when picked.position<=hand_size then first_player else second_player end,
    case when picked.position<=hand_size then picked.position else picked.position-hand_size end,
    (select ci.id from public.card_images ci where ci.card_id=picked.id and ci.enabled order by random() limit 1)
  from (
    select chosen.id,row_number() over(order by chosen.random_order)::smallint position
    from (
      select c.id,random() random_order from public.card_definitions c
      where c.enabled and c.kind='astronomical'
        and exists(select 1 from public.card_images ci where ci.card_id=c.id and ci.enabled)
      order by random_order limit (hand_size*2)
    ) chosen
  ) picked;
  insert into public.game_cards(game_id,card_id,player_id,hand_position)
  values (target_game_id,'clouds-seat-1',first_player,hand_size+1),
         (target_game_id,'clouds-seat-2',second_player,hand_size+1);
  insert into public.game_rounds(game_id,round_number,active_player_id) values(target_game_id,1,first_player);
  update public.games set status='in_progress',updated_at=now() where id=target_game_id;
end; $$;

create function public.request_rematch(target_game_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare target_game public.games%rowtype; first_player public.game_players%rowtype; second_player public.game_players%rowtype; round_count smallint;
begin
  select g.* into target_game from public.games g where g.id=target_game_id for update;
  if target_game.id is null or not public.is_game_member(target_game_id) then raise exception 'GAME_ACCESS_DENIED'; end if;
  if target_game.status<>'finished' then raise exception 'GAME_NOT_FINISHED'; end if;
  if exists(select 1 from public.game_players gp join public.players p on p.id=gp.player_id where gp.game_id=target_game_id and p.is_cpu) then raise exception 'REMATCH_MULTIPLAYER_ONLY'; end if;

  delete from public.rematch_requests rr where rr.game_id=target_game_id and rr.expires_at<=clock_timestamp();
  insert into public.rematch_requests(game_id,player_id,requested_at,expires_at)
  values(target_game_id,auth.uid(),clock_timestamp(),clock_timestamp()+interval '60 seconds')
  on conflict(game_id,player_id) do update set requested_at=excluded.requested_at,expires_at=excluded.expires_at;

  if (select count(*) from public.rematch_requests rr where rr.game_id=target_game_id and rr.expires_at>clock_timestamp())<2 then
    update public.games set updated_at=now() where id=target_game_id;
    return;
  end if;

  select gp.* into first_player from public.game_players gp where gp.game_id=target_game_id and gp.seat=1;
  select gp.* into second_player from public.game_players gp where gp.game_id=target_game_id and gp.seat=2;
  select count(*)::smallint into round_count from public.game_rounds gr where gr.game_id=target_game_id;
  insert into public.game_match_results(game_id,match_number,player_1_id,player_1_score,player_2_id,player_2_score,winner_id,rounds_played)
  values(target_game_id,target_game.match_number,first_player.player_id,first_player.score,second_player.player_id,second_player.score,
    case when first_player.score=second_player.score then null when first_player.score>second_player.score then first_player.player_id else second_player.player_id end,
    round_count)
  on conflict(game_id,match_number) do nothing;

  delete from public.game_rounds where game_id=target_game_id;
  delete from public.game_cards where game_id=target_game_id;
  update public.game_players set score=0 where game_id=target_game_id;
  delete from public.rematch_requests where game_id=target_game_id;
  update public.games set status='ready',match_number=match_number+1,
    starting_seat=case starting_seat when 1 then 2 else 1 end,updated_at=now()
  where id=target_game_id;
  perform public.start_game(target_game_id);
end; $$;

create function public.cancel_rematch(target_game_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_game_member(target_game_id) then raise exception 'GAME_ACCESS_DENIED'; end if;
  delete from public.rematch_requests where game_id=target_game_id and player_id=auth.uid();
  update public.games set updated_at=now() where id=target_game_id;
end; $$;

create or replace function public.get_game_state(requested_code text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare target_game public.games%rowtype; current_round public.game_rounds%rowtype; result jsonb;
begin
  select g.* into target_game from public.games g where g.room_code=upper(trim(requested_code));
  if target_game.id is null or not public.is_game_member(target_game.id) then raise exception 'ROOM_NOT_FOUND'; end if;
  select gr.* into current_round from public.game_rounds gr where gr.game_id=target_game.id order by gr.round_number desc limit 1;
  select jsonb_build_object('id',target_game.id,'code',target_game.room_code,'status',target_game.status,'rules',target_game.rules,'matchNumber',target_game.match_number,
    'players',(select jsonb_agg(jsonb_build_object(
      'id',p.id,'displayName',p.display_name,'seat',gp.seat,'score',gp.score,'isCpu',p.is_cpu,
      'sessionWins',(select count(*) from public.game_match_results mr where mr.game_id=target_game.id and mr.winner_id=p.id)+
        case when target_game.status='finished' and gp.score>(select min(op.score) from public.game_players op where op.game_id=target_game.id) then 1 else 0 end
    ) order by gp.seat) from public.game_players gp join public.players p on p.id=gp.player_id where gp.game_id=target_game.id),
    'sessionDraws',(select count(*) from public.game_match_results mr where mr.game_id=target_game.id and mr.winner_id is null)+
      case when target_game.status='finished' and (select count(distinct gp.score) from public.game_players gp where gp.game_id=target_game.id)=1 then 1 else 0 end,
    'rematch',jsonb_build_object(
      'requestedPlayerIds',(select coalesce(jsonb_agg(rr.player_id),'[]'::jsonb) from public.rematch_requests rr where rr.game_id=target_game.id and rr.expires_at>clock_timestamp()),
      'expiresAt',(select max(rr.expires_at) from public.rematch_requests rr where rr.game_id=target_game.id and rr.expires_at>clock_timestamp())
    ),
    'availableAttributes',(select coalesce(jsonb_agg(to_jsonb(a) order by a.display_order),'[]'::jsonb) from public.available_game_attributes(target_game.id) a),
    'hand',(select coalesce(jsonb_agg(public.game_card_payload_with_image(gc.card_id,gc.image_id) order by gc.hand_position),'[]'::jsonb) from public.game_cards gc where gc.game_id=target_game.id and gc.player_id=auth.uid() and gc.played_round is null),
    'round',jsonb_build_object('number',current_round.round_number,'activePlayerId',current_round.active_player_id,'status',current_round.status,'attribute',current_round.selected_attribute,'winnerId',current_round.winner_id,'isTie',current_round.is_tie,'isCancelled',current_round.is_cancelled,'actionDeadline',current_round.action_deadline,
      'selectedPlayerIds',(select coalesce(jsonb_agg(rs.player_id),'[]'::jsonb) from public.round_selections rs where rs.game_id=target_game.id and rs.round_number=current_round.round_number),
      'revealedCards',case when current_round.status='resolved' then (select coalesce(jsonb_agg(jsonb_build_object('playerId',rs.player_id,'card',public.game_card_payload_with_image(rs.card_id,gc.image_id))),'[]'::jsonb) from public.round_selections rs join public.game_cards gc on gc.game_id=rs.game_id and gc.card_id=rs.card_id where rs.game_id=target_game.id and rs.round_number=current_round.round_number) else '[]'::jsonb end)) into result;
  return result;
end; $$;

revoke execute on function public.request_rematch(uuid),public.cancel_rematch(uuid) from public,anon;
grant execute on function public.request_rematch(uuid),public.cancel_rematch(uuid) to authenticated;
