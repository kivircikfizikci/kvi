# Dark War CP Sync

This optional Windows helper passively reads the Alliance `Ranking → CP` response and sends only rank, player name and Combat Power to KVI Planner on localhost. It does not write to the game, inspect formations, or collect login/session fields.

1. Run **KVI-DarkWar-Sync.exe**. Windows asks for administrator access because packet capture requires it.
2. The planner opens and shows **Dark War CP sync · Connected** in Alliance.
3. Click **Start capture**, open `Alliance → Ranking → CP` in Dark War, then click **Finish & import**.

The companion window stays visible while the helper is listening and clearly shows Connected, Capturing, Complete, or Error status. It closes automatically after a successful import. **Stop helper** safely ends an unfinished capture.

Every successful read also creates JSON and CSV copies in `Desktop\KVI Dark War Sync`. If the browser connection fails, use **Load saved roster** in the Alliance sync card and select the JSON file.

Existing players are matched by name and only Total Power is updated. New ranked players are added with empty manual F1–F4 values. Players missing from the top-50 response are never deleted.
