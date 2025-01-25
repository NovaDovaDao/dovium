// src/tasks/holdings-tracker.ts
import { TrackerService } from "../services/db/DBTrackerService.ts";

function main() {
  const tracker = new TrackerService();
  
  const run = async () => {
    try {
      await tracker.trackHoldings();
    } catch (error) {
      console.error("Tracker error:", error);
    }
    setTimeout(run, 5000);
  };

  run();
}

if (import.meta.main) {
  main();
}