insert into public.area_catalogue (key, name, description, sort_order) values
  ('sleep',             'Sleep',              'Wind down earlier and wake up steadier.',                1),
  ('fitness',           'Fitness',            'Move your body most days. No gym required.',             2),
  ('nutrition',         'Nutrition',          'Eat in a way that leaves you steady, not stuffed.',      3),
  ('hydration',         'Hydration',          'Drink enough water that your head stops arguing.',       4),
  ('digital_detox',     'Digital detox',      'Put the phone down before it puts you down.',            5),
  ('focus',             'Focus / deep work',  'Protect one block of real concentration a day.',         6),
  ('work_boundaries',   'Work boundaries',    'Clock off properly, and mean it.',                       7),
  ('money',             'Money basics',       'Know what is coming in and what is going out.',          8),
  ('home_reset',        'Home reset',         'Ten minutes a day keeps the chaos down.',                9),
  ('declutter',         'Declutter',          'Let go of a little more each day.',                     10),
  ('relationships',     'Relationships',      'Show up for the people closest to you.',                11),
  ('social',            'Social connection',  'Stay in touch with the wider circle.',                  12),
  ('mindfulness',       'Mindfulness',        'Give your head somewhere quiet to land.',               13),
  ('outdoor',           'Outdoor time',       'Get outside, whatever the weather is doing.',           14),
  ('creative',          'Creative practice',  'Make something small, often.',                          15),
  ('learning',          'Learning',           'Feed your curiosity in small doses.',                   16),
  ('self_care',         'Self-care',          'Treat yourself like someone you are responsible for.',  17),
  ('morning_routine',   'Morning routine',    'Start the day on purpose.',                             18),
  ('evening_winddown',  'Evening wind-down',  'Give the day a proper ending.',                         19)
on conflict (key) do update
  set name = excluded.name,
      description = excluded.description,
      sort_order = excluded.sort_order;

insert into public.habit_template (key, area_key, title, detail, effort, sort_order) values
  ('sleep_lights_out',        'sleep',            'Lights out by your target time',                'Pick a time and treat it like an appointment.',     2, 1),
  ('sleep_no_screens',        'sleep',            'No screens for 30 minutes before bed',          'Phone charges in another room if you can manage it.', 2, 2),
  ('fitness_walk',            'fitness',          'Walk for 20 minutes',                           'Pace does not matter. Getting out does.',           1, 1),
  ('fitness_strength',        'fitness',          'Do a 10-minute strength set',                   'Bodyweight is fine. Press-ups, squats, planks.',    2, 2),
  ('nutrition_veg',           'nutrition',        'Eat vegetables with two meals',                 'Frozen counts. Tinned counts.',                     1, 1),
  ('nutrition_no_late',       'nutrition',        'No snacks after 9pm',                           'Close the kitchen and mean it.',                    2, 2),
  ('hydration_bottle',        'hydration',        'Finish a full water bottle',                    'Fill it once in the morning, once after lunch.',    1, 1),
  ('hydration_morning_glass', 'hydration',        'Drink a glass of water before coffee',          'Water first, then the good stuff.',                 1, 2),
  ('digital_phone_out',       'digital_detox',    'Keep your phone out of the bedroom',            'Buy a cheap alarm clock. It is worth it.',          2, 1),
  ('digital_no_scroll_hour',  'digital_detox',    'No scrolling for the first hour awake',         'Let your own thoughts go first.',                   2, 2),
  ('focus_block',             'focus',            'Do one 25-minute focus block',                  'Timer on, notifications off, one thing only.',      1, 1),
  ('focus_single_task',       'focus',            'Pick one priority and finish it',               'Decide it before you open anything else.',          2, 2),
  ('work_stop_time',          'work_boundaries',  'Stop work at your set time',                    'Say the time out loud in the morning.',             2, 1),
  ('work_no_email_evening',   'work_boundaries',  'No work email after dinner',                    'It will still be there tomorrow.',                  1, 2),
  ('money_check_balance',     'money',            'Check your balance once',                       'Once. Looking is not the same as worrying.',        1, 1),
  ('money_log_spend',         'money',            'Log everything you spent today',                'Notes app is fine. Accuracy beats neatness.',       2, 2),
  ('home_ten_minutes',        'home_reset',       'Do a 10-minute tidy',                           'Set a timer and stop when it goes.',                1, 1),
  ('home_clear_surface',      'home_reset',       'Clear one surface completely',                  'One table, one counter, one desk.',                 1, 2),
  ('declutter_one_item',      'declutter',        'Get rid of one thing',                          'Bin, charity bag, or sell pile.',                   1, 1),
  ('declutter_one_drawer',    'declutter',        'Sort one drawer or shelf',                      'Small container, finite job.',                      2, 2),
  ('rel_real_conversation',   'relationships',    'Have one proper conversation, phone away',      'Ten minutes of actual attention.',                  2, 1),
  ('rel_small_kindness',      'relationships',    'Do one small kind thing for someone close',     'Unprompted, unannounced.',                          1, 2),
  ('social_message',          'social',           'Message someone you have not spoken to lately', 'No agenda needed.',                                 1, 1),
  ('social_plan',             'social',           'Make or confirm one plan',                      'A date in the diary beats a vague intention.',      2, 2),
  ('mind_breathe',            'mindfulness',      'Take five slow breaths, eyes closed',           'Sixty seconds. That is the whole habit.',           1, 1),
  ('mind_sit',                'mindfulness',      'Sit quietly for 10 minutes',                    'No app required. A chair and a timer.',             2, 2),
  ('outdoor_daylight',        'outdoor',          'Get 15 minutes of daylight',                    'Earlier is better. Cloud still counts.',            1, 1),
  ('outdoor_no_headphones',   'outdoor',          'Take one walk without headphones',              'Let the world be the soundtrack.',                  1, 2),
  ('creative_ten',            'creative',         'Spend 10 minutes making something',             'Bad output is still output.',                       1, 1),
  ('creative_capture',        'creative',         'Capture one idea in writing',                   'One line is enough.',                               1, 2),
  ('learning_read',           'learning',         'Read 10 pages',                                 'Paper or screen, your call.',                       1, 1),
  ('learning_lesson',         'learning',         'Do one lesson or one chapter',                  'Finish the unit, do not just start it.',            2, 2),
  ('care_one_kind_thing',     'self_care',        'Do one thing purely because it is good for you','Not productive. Just good.',                        1, 1),
  ('care_reframe',            'self_care',        'Catch one harsh thought and reframe it',        'Notice it, then say the kinder version.',           2, 2),
  ('morning_no_snooze',       'morning_routine',  'Get up on the first alarm',                     'Feet on floor before the second thought.',          2, 1),
  ('morning_three_things',    'morning_routine',  'Write your three things for the day',           'Three. Not ten.',                                   1, 2),
  ('evening_shutdown',        'evening_winddown', 'Do a five-minute shutdown routine',             'Close the laptop, write tomorrow''s first task.',   1, 1),
  ('evening_tomorrow_ready',  'evening_winddown', 'Set out what you need for tomorrow',            'Clothes, bag, bottle. Future you says thanks.',     1, 2)
on conflict (key) do update
  set area_key = excluded.area_key,
      title = excluded.title,
      detail = excluded.detail,
      effort = excluded.effort,
      sort_order = excluded.sort_order;

insert into public.weekly_prompt (key, day_index, prompt, sort_order) values
  ('wk1_settling', 7,
   'One week in. What has actually felt different, and what has been harder than you expected?', 1),
  ('wk2_halfway', 14,
   'Two weeks down. Which habit has started to feel automatic, and which one are you still forcing?', 1),
  ('wk3_finish', 21,
   'Last day. What is worth keeping, what are you letting go of, and what would you tell yourself on day one?', 1)
on conflict (key) do update
  set day_index = excluded.day_index, prompt = excluded.prompt;

insert into public.reward_catalogue (key, name, description, cost_points, reward_type, payload, sort_order) values
  ('coach_pack_grit',  'Grit note pack',         'Blunter coach lines for the days you need pushing.',  40,  'coach_note_pack', '{"pack":"grit"}',      1),
  ('coach_pack_calm',  'Calm note pack',         'Gentler coach lines for the days you need holding.',  40,  'coach_note_pack', '{"pack":"calm"}',      2),
  ('theme_dawn',       'Dawn theme',             'Warm light palette for the whole app.',               80,  'theme',           '{"theme":"dawn"}',     3),
  ('theme_deep',       'Deep theme',             'Low-light palette for evening check-ins.',            80,  'theme',           '{"theme":"deep"}',     4),
  ('badge_finisher',   '21-day finisher badge',  'A quiet mark on your account for finishing a cycle.', 150, 'badge',           '{"badge":"finisher"}', 5)
on conflict (key) do update
  set name = excluded.name,
      description = excluded.description,
      cost_points = excluded.cost_points,
      reward_type = excluded.reward_type,
      payload = excluded.payload,
      sort_order = excluded.sort_order;
