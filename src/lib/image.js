import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function generateImage(prompt) {
  const output = await replicate.run("google/imagen-4", {
    input: {
      prompt,
      aspect_ratio: "1:1",
      safety_filter_level: "block_medium_and_above",
    },
  });

  // Get the URL of the generated image
  const url = output.url();
  return url;
}
