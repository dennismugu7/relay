/**
 * Test helper, run as a separate process by state.test.ts and activity.test.ts.
 *
 * Usage: node --import tsx concurrent-worker.ts <dir> <count> <state|activity> <name>
 * Does `count` updates as fast as it can, so two copies run at once collide.
 */
import { appendActivity } from '../activity.js';
import { enqueueMessage, updateState } from '../state.js';

const [dir = '', countText = '0', mode = 'state', name = 'worker'] = process.argv.slice(2);
const count = Number(countText);

for (let i = 0; i < count; i++) {
  if (mode === 'state') {
    await updateState(dir, (state) => {
      state.rounds++;
      enqueueMessage(state, 'lead', 'builder', `${name} #${i}`);
    });
  } else {
    await appendActivity(dir, {
      project: 'app1',
      kind: 'handoff',
      from: 'lead',
      to: 'builder',
      message: `${name} #${i}`,
    });
  }
}
