create table public.game_round_history (
  game_id uuid not null,
  match_number integer not null check (match_number > 0),
  round_number smallint not null,
  resolved_at timestamptz not null,
  selected_attribute text,
  attribute_comparison public.attribute_comparison,
  seat_1_card_id text not null,
  seat_1_card_name text not null,
  seat_1_value numeric,
  seat_2_card_id text not null,
  seat_2_card_name text not null,
  seat_2_value numeric,
  winner_id uuid,
  winning_card_id text,
  losing_card_id text,
  is_tie boolean not null,
  is_cancelled boolean not null,
  primary key (game_id, match_number, round_number)
);

alter table public.game_round_history enable row level security;
revoke all on public.game_round_history from anon, authenticated;
create index game_round_history_winning_card_idx
  on public.game_round_history (winning_card_id)
  where winning_card_id is not null;

create function public.archive_game_round(target_game_id uuid, target_round_number smallint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.game_round_history (
    game_id, match_number, round_number, resolved_at, selected_attribute, attribute_comparison,
    seat_1_card_id, seat_1_card_name, seat_1_value,
    seat_2_card_id, seat_2_card_name, seat_2_value,
    winner_id, winning_card_id, losing_card_id, is_tie, is_cancelled
  )
  select
    gr.game_id, g.match_number, gr.round_number, coalesce(gr.resolved_at, now()),
    gr.selected_attribute, ad.comparison,
    seat_1_selection.card_id, seat_1_card.common_name, seat_1_value.value,
    seat_2_selection.card_id, seat_2_card.common_name, seat_2_value.value,
    gr.winner_id,
    case
      when gr.winner_id = seat_1_selection.player_id then seat_1_selection.card_id
      when gr.winner_id = seat_2_selection.player_id then seat_2_selection.card_id
    end,
    case
      when gr.winner_id = seat_1_selection.player_id then seat_2_selection.card_id
      when gr.winner_id = seat_2_selection.player_id then seat_1_selection.card_id
    end,
    gr.is_tie, gr.is_cancelled
  from public.game_rounds gr
  join public.games g on g.id = gr.game_id
  join public.game_players seat_1 on seat_1.game_id = gr.game_id and seat_1.seat = 1
  join public.game_players seat_2 on seat_2.game_id = gr.game_id and seat_2.seat = 2
  join public.round_selections seat_1_selection
    on seat_1_selection.game_id = gr.game_id
    and seat_1_selection.round_number = gr.round_number
    and seat_1_selection.player_id = seat_1.player_id
  join public.round_selections seat_2_selection
    on seat_2_selection.game_id = gr.game_id
    and seat_2_selection.round_number = gr.round_number
    and seat_2_selection.player_id = seat_2.player_id
  join public.card_definitions seat_1_card on seat_1_card.id = seat_1_selection.card_id
  join public.card_definitions seat_2_card on seat_2_card.id = seat_2_selection.card_id
  left join public.card_attribute_values seat_1_value
    on seat_1_value.card_id = seat_1_selection.card_id
    and seat_1_value.attribute_id = gr.selected_attribute
  left join public.card_attribute_values seat_2_value
    on seat_2_value.card_id = seat_2_selection.card_id
    and seat_2_value.attribute_id = gr.selected_attribute
  left join public.attribute_definitions ad on ad.id = gr.selected_attribute
  where gr.game_id = target_game_id
    and gr.round_number = target_round_number
    and gr.status = 'resolved'
  on conflict (game_id, match_number, round_number) do nothing;
end; $$;

revoke execute on function public.archive_game_round(uuid, smallint) from public, anon, authenticated;

create function public.capture_resolved_game_round()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from new.status and new.status = 'resolved' then
    perform public.archive_game_round(new.game_id, new.round_number);
  end if;
  return new;
end; $$;

revoke execute on function public.capture_resolved_game_round() from public, anon, authenticated;

create trigger archive_resolved_game_round
  after update of status on public.game_rounds
  for each row execute function public.capture_resolved_game_round();

do $$
declare
  resolved_round record;
begin
  for resolved_round in
    select gr.game_id, gr.round_number
    from public.game_rounds gr
    where gr.status = 'resolved'
  loop
    perform public.archive_game_round(resolved_round.game_id, resolved_round.round_number);
  end loop;
end; $$;
