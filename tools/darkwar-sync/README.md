# KVI Dark War Sync

This optional Windows helper passively reads visible Dark War game responses for KVI Planner. It does not write to or modify the game.

## Data collected

- Alliance members: permanent UID, current game name, R1-R5 rank, total power, Main Building Level, gender and country.
- State player ranking: first 150 players, alliance, building level, total power and any available gender/kill data.
- State alliance power ranking: alliance name/tag, leader, member count, total power and rank.

Country is stored for future use but is not currently displayed. Gender is game-managed and cannot be edited in the planner. Manual F1-F4 formation data and Franky participation are preserved during sync.

## How to sync

1. Run **KVI-DarkWar-Sync.exe**. Windows requests administrator access for passive packet capture.
2. Click **Start capture** in the helper window or in the planner Alliance tab and wait for **Listening for game data**.
3. In Dark War, open the Alliance member list, State player kill ranking, State player power ranking and State alliance power ranking. Wait a few seconds on each screen.
4. Return to the planner and click **Finish & import**.
5. Review UID matches, then apply the update.

Every capture writes `KVI-Game-Data-*.json` to `Desktop\KVI Dark War Sync`, even when one of the requested game screens was not captured. If the browser reports `Failed to fetch`, use **Load saved game data** and choose that JSON file. Partial files containing State data can also be imported without changing the Alliance roster.

The helper also saves `KVI-Capture-*.pcapng` and `.etl` diagnostic captures. These files make it possible to inspect game-data format changes when a scan produces zero recognized rows; they are not uploaded automatically.

The JSON is the recommended source because it also includes the State snapshot used for update-to-update percentage changes.

When a player profile response is captured, the JSON also includes
`playerProfileUpdates` entries with the player UID and the game's raw
`lastUpdateTime` Unix timestamp (seconds). Its meaning as a last-active time
has not been verified.

`playerPositions` contains UID, X and Y from the Alliance member list and any
decoded player-base details. Open a player's base or full profile to collect
those individual responses. Game Map uses the Alliance roster to select which
captured positions to display.
