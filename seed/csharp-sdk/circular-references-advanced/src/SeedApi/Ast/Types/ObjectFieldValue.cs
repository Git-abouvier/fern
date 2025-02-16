using System.Text.Json.Serialization;
using SeedApi;

namespace SeedApi;

public class ObjectFieldValue
{
    [JsonPropertyName("name")]
    public string Name { get; init; }

    [JsonPropertyName("value")]
    public FieldValue Value { get; init; }
}
