import fs from 'fs';
import path from 'path';
import { emulatorTarget } from '../firebaseEmulator';

const APP_DIR = path.resolve(__dirname, '../../..');

describe('emulatorTarget', () => {
  it('is off when the variable is absent or blank', () => {
    expect(emulatorTarget(undefined)).toBeNull();
    expect(emulatorTarget('')).toBeNull();
    expect(emulatorTarget('   ')).toBeNull();
  });

  it('points auth and firestore at their default emulator ports', () => {
    expect(emulatorTarget('127.0.0.1')).toEqual({
      authUrl: 'http://127.0.0.1:9099',
      firestoreHost: '127.0.0.1',
      firestorePort: 8080,
    });
  });

  it('refuses anything that is not a bare local host, so a typo cannot reroute prod traffic', () => {
    expect(emulatorTarget('https://evil.example.com')).toBeNull();
    expect(emulatorTarget('10.0.0.5')).toBeNull();
    expect(emulatorTarget('localhost:9099')).toBeNull();
  });
});

describe('release builds never talk to an emulator', () => {
  it('no EAS profile sets the emulator host', () => {
    const eas = fs.readFileSync(path.join(APP_DIR, 'eas.json'), 'utf8');
    expect(eas).not.toMatch(/FIREBASE_EMULATOR_HOST/);
  });

  it('the committed env template leaves it unset', () => {
    const example = fs.readFileSync(path.join(APP_DIR, '.env.example'), 'utf8');
    expect(example).not.toMatch(/^EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=\S/m);
  });
});
