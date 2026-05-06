// Production build.
// REST traffic goes through the YARP gateway (auth, messages, rooms, etc.).
// SignalR WebSocket traffic connects directly to Hub.API to avoid YARP's
// WebSocket frame forwarding quirks on Render's free tier — once the upgrade
// succeeds via YARP the gateway doesn't relay subsequent frames reliably,
// so Hub times out clients with code 1011. Direct connection sidesteps that.
export const environment = {
  production: true,
  apiUrl: 'https://connecthub-gateway-u9g6.onrender.com',
  hubUrl: 'https://connecthub-hub-u9g6.onrender.com',
  notificationHubUrl: 'https://connecthub-notification-u9g6.onrender.com',
  googleClientId: '771923367638-e026tfg64dbhtrrfq69gsdmve0m6lmsv.apps.googleusercontent.com'
};
