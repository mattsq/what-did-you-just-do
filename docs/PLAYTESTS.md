# Playtests

Notes from paired sessions, following the protocol in [DESIGN.md §6](DESIGN.md#6-research-instrumentation-and-playtest-protocol). Record only with the participants' informed consent. Never write down names, contact details, voice recordings, transcripts or anything else that identifies a participant; describe people as "A" and "B" by clearing.

## Status

No sessions have been run yet. Milestone 3 needs at least two sessions with fresh pairs who have not seen the puzzle.

## Running a session

1. Deploy or run the production build (`npm run build && npm start`) somewhere both participants can reach. Do not use the development inspector during a session: it is for the facilitator's preparation and later analysis only.
2. Ask the participants to start a voice call with each other. Explain the movement and interaction keys and nothing else.
3. Send one participant the game address; they create a room and send the invite link to the other.
4. Observe without hinting. Stop when they finish the finale and lose interest, or after about 15 minutes.
5. Optionally, open the same room with `?inspect` in a development build afterwards and copy its trace; a trace contains roles, actions and relative times only.

## Record per session

Copy this block for each session.

```text
Session: <number>, <date>
Build: <commit>
Participants: fresh pair / one had played before

First control touched (A / B), and when:
First spontaneous "what happened?" question, and who asked:
Who first stated each relation:
  wheel -> tower orientation:
  lever -> tower halo:
  valve -> pool ripples:
  button -> beacon:
Did one player become a passive executor of the other's instructions?
Laughter, surprise:
Confusion, and what resolved it:
Repeated a control for fun after understanding it?
Finale reached? Time from start, and with any hint?
Where did interest drop?
What would we change?
```

## Findings

None yet.
