declare module "imagetracerjs" {
  type ImageDataLike = {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  };
  const ImageTracer: {
    imagedataToSVG(
      imageData: ImageDataLike,
      options?: Record<string, unknown>,
    ): string;
  };
  export default ImageTracer;
}
