using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

using ConnectHub.Auth.API.Data;
using ConnectHub.Auth.API.Repositories;
using ConnectHub.Auth.API.Services;

var builder = WebApplication.CreateBuilder(args);


// ── Controllers ────────────────────────────────────────────────
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(
            new System.Text.Json.Serialization.JsonStringEnumConverter());
    });


// ── Swagger ────────────────────────────────────────────────────
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Bearer token — paste: Bearer {token}",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.ApiKey,
        Scheme = "Bearer"
    });

    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            new string[] {}
        }
    });
});


// ── Database ───────────────────────────────────────────────────
// Postgres on Neon. All four services share a single `neondb`, so each one
// needs its own migrations-history table to avoid clobbering the others on
// auto-migrate. Without `MigrationsHistoryTable`, every context would race
// to write the default `__EFMigrationsHistory` table and the second start-up
// would think the wrong migrations had already been applied.
builder.Services.AddDbContext<AuthDbContext>(options =>
{
    var connectionString = (builder.Configuration.GetConnectionString("DefaultConnection")
        ?? builder.Configuration["DATABASE_URL"] ?? "").Trim();
    options.UseNpgsql(connectionString,
        npgsql => npgsql.MigrationsHistoryTable("__EFMigrationsHistory_Auth"));
});


// ── Dependency Injection ───────────────────────────────────────
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IUserService, UserService>();


// ── JWT Setup ──────────────────────────────────────────────────
var key = Encoding.UTF8.GetBytes(
    builder.Configuration["Jwt:Key"] 
    ?? throw new Exception("JWT Key missing in appsettings.json")
);

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
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

        IssuerSigningKey = new SymmetricSecurityKey(key)
    };
    options.Events = new JwtBearerEvents
    {
        OnAuthenticationFailed = context =>
        {
            Console.WriteLine("JWT Error: " + context.Exception.Message);
            return Task.CompletedTask;
        }
    };
});

builder.Services.AddAuthorization();

// ── CORS ──────────────────────────────────────────────────────────
// Origins from Cors:AllowedOrigins (semicolon-separated). Entries starting with
// "*." treated as suffix wildcards (e.g. "*.vercel.app").
var corsOrigins = builder.Configuration["Cors:AllowedOrigins"]
    ?.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    ?? new[] { "http://localhost:4200", "*.vercel.app" };

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

// ── Build App ──────────────────────────────────────────────────
var app = builder.Build();


// ── Middleware ─────────────────────────────────────────────────
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// app.UseHttpsRedirection();
app.UseCors("AllowFrontend");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// ── Auto Migration ────────────────────────────────────────────────
// Without this, fresh deploys (especially `docker-compose up`) start with an
// empty Auth DB → /api/users/login and every downstream call returns 500.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AuthDbContext>();
    try
    {
        db.Database.Migrate();

        // ── Seed Admin User ──
        var adminEmail = "bhanudagur1702@gmail.com";
        var adminUser = db.Users.FirstOrDefault(u => u.Email == adminEmail);
        if (adminUser != null && !adminUser.IsSystemAdmin)
        {
            adminUser.IsSystemAdmin = true;
            db.SaveChanges();
            Console.WriteLine($"[Admin Seed] Promoted {adminEmail} to SystemAdmin.");
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[Migration/Seed Skipped] {ex.Message}");
    }
}

app.Run();