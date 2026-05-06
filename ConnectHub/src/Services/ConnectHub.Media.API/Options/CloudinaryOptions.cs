namespace ConnectHub.Media.API.Options;

// appsettings.json se Cloudinary config yahan aayegi
public class CloudinaryOptions
{
    public string CloudName { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public string ApiSecret { get; set; } = string.Empty;
}