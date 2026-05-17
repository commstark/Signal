# Workout parsing test fixtures

Ten workout transcripts plus one mixed (workout + food) covering the
shapes Jon actually uses. After the deploy, record each one and verify
the entry shows on `/today` with `parse_status: 'ok'` and zero warnings.

If an entry shows `partial` or `failed`, the warnings list under it
names the exact section that broke.

---

## 1 — Heavy strength, ramp-up

> "Had a 32-minute workout, leg focused. Did 7 sets of squats working up to 225 where I did 5 reps. Two-minute breaks in between. Felt great."

Expected canonical:
- 1 workout_session (32 min, leg focus, no incident)
- 1 exercise: Squats, legs, strength, 7 sets (last set: 225×5, earlier sets weight null)

## 2 — Cardio only

> "Did 30 minutes of zone 2 on the bike. Easy pace, felt good."

Expected:
- 1 exercise: Bike / Cycling, full_body (or null), cardio, 1 set (duration_s=1800)
- session_notes captures "zone 2, easy"

## 3 — Isometric holds

> "Three dead hangs today. First was 45 seconds, second was 30, third was 25. Then a 60-second plank."

Expected:
- exercise 1: Dead hang, back, isometric, 3 sets (duration_s 45/30/25)
- exercise 2: Plank, core, isometric, 1 set (duration_s=60)

## 4 — Skipping conditioning

> "Three sets of 100 skips with 30-second rests between."

Expected:
- exercise: Skipping, full_body, conditioning (or cardio), 3 sets (count=100 each)

## 5 — Bodyweight circuit

> "Did a quick circuit: 3 rounds of 15 pushups, 20 air squats, 10 pullups. About 12 minutes total."

Expected:
- 3 exercises (pushups/squats/pullups), each with 3 bodyweight sets (reps filled, weight null)
- duration_min=12

## 6 — Mixed modalities (long, the failing one)

> "Had a 32-minute workout, leg focused. Did 7 sets of squats working up to 225 where I did 5 reps, two-minute breaks. Then 3 sets of 100 skips, 30 second rests. Two sets of kettlebell swings, 10 reps with 25 pounds. Then one set of dumbbell walking lunges with 50 pounds total, 25 on each side, but I stopped because my leg didn't feel right. Then 3 sets of dead hangs with leg raises, one for 45s, two for 30s. Some ball work at the end."

Expected:
- duration_min=32, focus=legs, incident='cut_short' or 'pain'
- Squats (strength, legs, 7 sets)
- Skipping (conditioning, full_body, 3×100 count)
- Kettlebell swings (strength, full_body, 2 sets × 10 reps × 25 lb)
- Dumbbell walking lunges (strength, legs, 1 set × 50 lb with incident note)
- Dead hangs with leg raises (isometric, back/core, 3 sets duration_s 45/30/30)
- Ball work (mobility, sets [] or 1 set null) — session_notes mentions "some ball work" if no clear sets

## 7 — Injury cut-short

> "Started bench press, did one warm-up set at 135, but shoulder felt off so I stopped. Just stretched after."

Expected:
- exercise 1: Bench press, chest, strength, 1 set (135 lb)
- exercise 2: Stretching, null, mobility
- incident='pain' or 'cut_short'

## 8 — Upper body strength

> "Push day: 4 sets bench at 185 for 8 reps. 3 sets shoulder press at 95 for 10. 3 sets cable flies, last set rpe 9."

Expected:
- Bench press: chest, strength, 4 sets (185×8 each)
- Shoulder press: shoulders, strength, 3 sets (95×10 each)
- Cable flies: chest, strength, 3 sets, last set rpe=9
- focus='push' or 'upper'

## 9 — Active recovery / mobility

> "Just did 20 minutes of foam rolling and some hip mobility work today. Easy day."

Expected:
- Foam rolling: full_body, mobility, 1 set (duration_s=1200)
- Hip mobility: legs, mobility
- duration_min=20

## 10 — RPE-driven AMRAP

> "Squats today. Worked up to 245 for an AMRAP, hit 4 reps at rpe 10. Toast after."

Expected:
- Squats: legs, strength, 1 set (245×4, rpe=10)
- session_notes captures "AMRAP top set, toast after"

---

## 11 — MIXED (workout + food + supplements)

> "Just finished my leg workout, 30 minutes. Did 5 sets of squats up to 200 for 5 reps. Felt good. Now drinking a protein shake with 30 grams of whey and a banana, and took my morning vitamin stack."

Expected:
- intent='mixed'
- Workout section: squats, legs, strength, 5 sets (top set 200×5), duration_min=30
- Health section: food_items [protein shake, banana], protein_g≈30, mood=null score+descriptor='good'
- Supplement section: 'morning vitamin stack' logged as taken (matched against existing stack)
- parse_status='ok' across all three
- Stats on /today: protein ≈ 30g, log shows the entry with three section indicators
