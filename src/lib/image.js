import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function generateImage(prompt) {
  const output = await replicate.run("black-forest-labs/flux-2-pro", {
    input: {
      prompt,
    },
  });

  const url = output.url();
  return url;
}
