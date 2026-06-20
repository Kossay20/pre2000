import { createNavigationContainerRef } from '@react-navigation/native';

/**
 * Global navigation container ref.
 *
 * Lives in its own module (not App.tsx) so leaf screens nested deep in tab/stack/material-top-tab
 * navigators can drive cross-navigator navigation without importing App.tsx (which would create a
 * circular import: App.tsx -> MainTabs -> …screens… -> App.tsx). App.tsx re-exports this for
 * backward compatibility.
 */
export const navigationRef = createNavigationContainerRef();
