update public.games
set rules = jsonb_set(rules, '{actionTimeoutSeconds}', '60'::jsonb, true);

alter table public.games
alter column rules set default '{"handSize":5,"roundsToPlay":5,"actionTimeoutSeconds":60}'::jsonb;

alter table public.game_rounds
alter column action_deadline set default (now() + interval '60 seconds');

update public.game_rounds
set action_deadline = now() + interval '60 seconds'
where status <> 'resolved';
