namespace ConnectHub.Media.API.DTOs;

public class MediaStatsDto
{
    public int TotalFiles { get; set; }
    public long TotalSizeKb { get; set; }
    public int ImageCount { get; set; }
    public int DocumentCount { get; set; }
    public int AudioCount { get; set; }
    public int ExpiredCount { get; set; }
}