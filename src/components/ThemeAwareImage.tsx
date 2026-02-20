/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";
import type { ImgHTMLAttributes } from "react";

export type ImageSrcInfo = {
  light: {
    src: string;
    srcSet: string;
  };
  dark?: {
    src: string;
    srcSet: string;
  };
};

type ThemeAwareImageProps = {
  srcInfo: ImageSrcInfo;
  className?: string;
} & Partial<ImgHTMLAttributes<HTMLImageElement>>;

/**
 * Displays images based on the current theme.
 *
 * If both srcLight and srcDark are provided, the image will be displayed based on the current theme.
 * If neither srcLight nor srcDark are provided, the image will be null.
 * If only srcLight or srcDark is provided, the image will be displayed based on the provided source.
 */
export default function ThemeAwareImage({
  srcInfo,
  sizes,
  alt,
  className,
  ...props
}: ThemeAwareImageProps) {
  const { light, dark } = srcInfo;
  const { src: srcLight, srcSet: srcSetLight } = light;
  const { src: srcDark, srcSet: srcSetDark } = dark ?? {};

  if (!srcLight && !srcDark) {
    return null;
  }

  if (srcLight && srcDark) {
    return (
      <>
        <img
          srcSet={srcSetLight}
          sizes={sizes}
          key={srcLight}
          src={srcLight}
          alt={alt}
          className={cn("dark:hidden", className)}
          {...props}
        />
        <img
          srcSet={srcSetDark}
          sizes={sizes}
          key={srcDark}
          src={srcDark}
          alt={alt}
          className={cn("light:hidden", className)}
          {...props}
        />
      </>
    );
  }

  return (
    <img
      src={srcLight ?? srcDark}
      srcSet={srcSetLight ?? srcSetDark}
      sizes={sizes}
      alt={alt}
      className={className}
      {...props}
    />
  );
}
