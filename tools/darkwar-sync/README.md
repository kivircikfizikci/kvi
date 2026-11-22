# KVI Dark War Sync

This optional Windows helper passively reads visible Dark War game responses for KVI Planner. It does not write to or modify the game.

## Data collected

- Alliance members: permanent UID, current game name, R1-R5 rank, total power, Main Building Level, gender and country.
- State player power ranking: first 150 players, alliance, building level and total power.
- State alliance power ranking: alliance name/tag, leader, member count, total power and rank.

Country is stored for future use but is not currently displayed. Gender is game-managed and cannot be edited in the planner. Manual F1-F4 formation data and Franky participation are preserved during sync.

## How to sync

1. Run **KVI-DarkWar-Sync.exe**. Windows requests administrator access for passive packet capture.
2. In the planner Alliance tab, click **Start capture** and wait for **Listening for game data**.
3. In Dark War, open the Alliance member list, State player power ranking and State alliance power ranking. Wait a few seconds on each screen.
4. Return to the planner and click **Finish & import**.
5. Review UID matches, then apply the update.

Every successful capture also writes a complete `KVI-Game-Data-*.json` and alliance-member CSV to `Desktop\KVI Dark War Sync`. If the browser reports `Failed to fetch`, use **Load saved game data** and choose that JSON file.

The JSON is the recommended source because it also includes the State snapshot used for update-to-update percentage changes.
