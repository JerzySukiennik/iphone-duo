// App registry: metadata for icons/search + lazy module loaders.
export const APPS = {
  phone:      { id: 'phone', name: 'Phone', icon: 'phone', load: () => import('./apps/phone.js') },
  safari:     { id: 'safari', name: 'Safari', icon: 'safari', load: () => import('./apps/safari.js') },
  messages:   { id: 'messages', name: 'Messages', icon: 'messages', load: () => import('./apps/messages.js') },
  music:      { id: 'music', name: 'Music', icon: 'music', load: () => import('./apps/music.js') },
  camera:     { id: 'camera', name: 'Camera', icon: 'camera', load: () => import('./apps/camera.js') },
  photos:     { id: 'photos', name: 'Photos', icon: 'photos', load: () => import('./apps/photos.js') },
  reels:      { id: 'reels', name: 'Reels', icon: 'reels', load: () => import('./apps/reels.js') },
  clock:      { id: 'clock', name: 'Clock', icon: 'clock', load: () => import('./apps/clock.js') },
  calendar:   { id: 'calendar', name: 'Calendar', icon: 'calendar', load: () => import('./apps/calendar.js') },
  notes:      { id: 'notes', name: 'Notes', icon: 'notes', load: () => import('./apps/notes.js') },
  calculator: { id: 'calculator', name: 'Calculator', icon: 'calculator', load: () => import('./apps/calculator.js') },
  weather:    { id: 'weather', name: 'Weather', icon: 'weather', load: () => import('./apps/weather.js') },
  settings:   { id: 'settings', name: 'Settings', icon: 'settings', load: () => import('./apps/settings.js') },
};
