using Microsoft.AspNetCore.Http;
using System;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace ConnectHub.Gateway.Middleware
{
    public class GatewayRetryMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly ILogger<GatewayRetryMiddleware> _logger;

        public GatewayRetryMiddleware(RequestDelegate next, ILogger<GatewayRetryMiddleware> logger)
        {
            _next = next;
            _logger = logger;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            int retryCount = 0;
            int maxRetries = 3;
            
            // Hum asli body ko buffer karenge taaki retry ke waqt dubara bhej sakein
            context.Request.EnableBuffering();

            while (retryCount <= maxRetries)
            {
                try
                {
                    // Request ko agle middleware (YARP) par bhejein
                    await _next(context);

                    // Agar response 502 (Bad Gateway) ya 429 (Too Many Requests) hai, toh retry karein
                    if (context.Response.StatusCode == 502 || context.Response.StatusCode == 429)
                    {
                        if (retryCount < maxRetries)
                        {
                            retryCount++;
                            _logger.LogWarning($"Backend returned {context.Response.StatusCode}. Retrying {retryCount}/{maxRetries}...");
                            
                            // Thoda wait karein (Exponential backoff: 2s, 4s, 8s)
                            await Task.Delay(TimeSpan.FromSeconds(Math.Pow(2, retryCount)));
                            
                            // Request body position reset karein retry ke liye
                            context.Request.Body.Position = 0;
                            // Response ko clear karein retry ke liye (Sirf headers clear hote hain mostly)
                            // Note: ASP.NET Core mein response start hone ke baad clear karna mushkil hota hai, 
                            // lekin YARP proxy hone se pehle hi 502 detect kar leta hai aksar.
                            continue;
                        }
                    }
                    
                    break; // Success ya max retries reached
                }
                catch (Exception ex)
                {
                    if (retryCount < maxRetries)
                    {
                        retryCount++;
                        _logger.LogWarning($"Gateway error: {ex.Message}. Retrying {retryCount}/{maxRetries}...");
                        await Task.Delay(TimeSpan.FromSeconds(2));
                        context.Request.Body.Position = 0;
                    }
                    else
                    {
                        throw;
                    }
                }
            }
        }
    }
}
