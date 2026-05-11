using Google.Api.Gax.Grpc;
using Google.Cloud.Vision.V1;

namespace SmartFridgeKiosk;

public class OcrReaderService : IOcrReaderService
{
    public async Task<string> ReadImageAsync(byte[] bytes, CancellationToken ct)
    {
        var client = await ImageAnnotatorClient.CreateAsync(ct);
        var image = Image.FromBytes(bytes);
        var response = await client.DetectDocumentTextAsync(image, null, CallSettings.FromCancellationToken(ct));
        return response.Text;
    }
}

public interface IOcrReaderService
{
    Task<string> ReadImageAsync(byte[] bytes, CancellationToken ct);
}