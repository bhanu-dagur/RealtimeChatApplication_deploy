using System.Text;
using AspNetCoreRateLimit;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Serilog;
using ConnectHub.Gateway.Middleware;

var builder = WebApplication.CreateBuilder(args);

// ── Serilog ───────────────────────────────────────────────────────
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateLogger();
builder.Host.UseSerilog();

// ── YARP Reverse Proxy ────────────────────────────────────────────
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"))
    .ConfigureHttpClient((context, handler) =>
    {
        if (handler is SocketsHttpHandler socketsHandler)
        {
            // Render par internal/public SSL handshake issues se bachne ke liye
            socketsHandler.SslOptions.RemoteCertificateValidationCallback = (sender, cert, chain, errors) => true;
        }
    });

// ── JWT Authentication ────────────────────────────────────────────
var jwtSecret = builder.Configuration["Jwt:Key"]!;
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(jwtSecret))
        };

        // SignalR ke liye query string se token lo
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken) &&
                    path.StartsWithSegments("/hubs"))
                {
                    context.Token = accessToken;
                }
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

// ── Rate Limiting ─────────────────────────────────────────────────
builder.Services.AddMemoryCache();
builder.Services.Configure<IpRateLimitOptions>(
    builder.Configuration.GetSection("IpRateLimiting"));
builder.Services.AddSingleton<IIpPolicyStore, MemoryCacheIpPolicyStore>();
builder.Services.AddSingleton<IRateLimitCounterStore,
    MemoryCacheRateLimitCounterStore>();
builder.Services.AddSingleton<IRateLimitConfiguration, RateLimitConfiguration>();
builder.Services.AddSingleton<IProcessingStrategy, AsyncKeyLockProcessingStrategy>();
builder.Services.AddInMemoryRateLimiting();

// ── CORS ──────────────────────────────────────────────────────────
// Origins from Cors:AllowedOrigins (semicolon-separated). Entries starting with
// "*." treated as suffix wildcards (e.g. "*.vercel.app" matches every preview
// deploy). In Render set:
//   Cors__AllowedOrigins = http://localhost:4200;*.vercel.app
var corsOrigins = builder.Configuration["Cors:AllowedOrigins"]
    ?.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    ?? new[] { "http://localhost:4200", "http://localhost:63770", "*.vercel.app" };

var exactOrigins = corsOrigins.Where(o => !o.Contains("*.")).ToHashSet(StringComparer.OrdinalIgnoreCase);
var wildcardSuffixes = corsOrigins
    .Where(o => o.Contains("*."))
    .Select(o => o[(o.IndexOf("*.") + 1)..])
    .ToList();

bool IsAllowedOrigin(string origin) =>
    exactOrigins.Contains(origin) ||
    (Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
     wildcardSuffixes.Any(suf => uri.Host.EndsWith(suf, StringComparison.OrdinalIgnoreCase)));

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend",
        policy => policy
            .SetIsOriginAllowed(IsAllowedOrigin)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials());
});

var app = builder.Build();

// ── Middleware Pipeline ───────────────────────────────────────────
// WebSocket upgrade support — required for YARP to forward SignalR /hubs/* to
// Hub.API and Notification.API. Without this, Kestrel rejects the upgrade
// handshake and the client sees code 1011 (server termination) on connect.
app.UseWebSockets(new WebSocketOptions
{
    KeepAliveInterval = TimeSpan.FromSeconds(30)
});

app.UseMiddleware<GatewayRetryMiddleware>();
app.UseMiddleware<RequestLoggingMiddleware>();

app.UseIpRateLimiting();

app.UseCors("AllowFrontend");

app.UseAuthentication();
app.UseAuthorization();

// ── Health Check Endpoint ─────────────────────────────────────────
app.MapGet("/health", () => new
{
    Status = "Healthy",
    Service = "ConnectHub Gateway",
    Timestamp = DateTime.UtcNow,
    Routes = new[]
    {
        "POST   /api/users/register    → Auth API",
        "POST   /api/users/login       → Auth API",
        "GET    /api/users/{id}        → Auth API",
        "GET    /api/messages/direct   → Message API",
        "GET    /api/messages/room     → Message API",
        "POST   /api/rooms/create      → Room API",
        "GET    /api/rooms/public      → Room API",
        "GET    /api/presence/online   → Hub API",
        "WS     /hubs/chat             → Hub API (SignalR)",
        "WS     /hubs/notifications    → Notification API (SignalR)",
        "POST   /api/notifications/send → Notification API",
        "POST   /api/media/upload      → Media API"
    }
});

// ── YARP Proxy ────────────────────────────────────────────────────
// .RequireCors() is mandatory: without it, MapReverseProxy bypasses the
// CORS middleware and preflight OPTIONS requests get forwarded upstream
// without an Access-Control-Allow-Origin header on the response.
app.MapReverseProxy().RequireCors("AllowFrontend");

app.Run();