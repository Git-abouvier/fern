using System.Text.Json.Serialization;

namespace SeedQueryParameters;

public class User
{
    [JsonPropertyName("name")]
    public string Name { get; init; }

    [JsonPropertyName("tags")]
    public List<List<string>> Tags { get; init; }
}
