/**
 * Jest environment for tests that must run in a given timezone.
 *
 * Jest hands every test file a copy of process.env, so `process.env.TZ = '…'` inside a test
 * never reaches Node and the clock stays in the machine's zone. This environment runs
 * outside the sandbox: it exposes `setTestTimezone(tz)` to the test file, which sets the
 * real TZ (Node re-reads it on assignment), and puts the original zone back at teardown.
 *
 * Use with a docblock at the top of the test file:
 *   /** @jest-environment ./testing/timezoneEnvironment.js *\/
 */
const { TestEnvironment } = require('jest-environment-node');

class TimezoneEnvironment extends TestEnvironment {
    constructor(config, context) {
        super(config, context);
        this.originalTz = process.env.TZ;
        this.global.setTestTimezone = (tz) => {
            process.env.TZ = tz;
        };
    }

    async teardown() {
        if (this.originalTz === undefined) delete process.env.TZ;
        else process.env.TZ = this.originalTz;
        await super.teardown();
    }
}

module.exports = TimezoneEnvironment;
