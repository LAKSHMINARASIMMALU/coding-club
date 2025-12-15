import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative h-screen w-full">
       <Image
        src="https://picsum.photos/seed/32/1920/1080"
        alt="Abstract background"
        fill
        className="object-cover"
        data-ai-hint="abstract technology"
      />
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <div className="relative z-10 flex h-full items-center justify-center p-4">
        {children}
      </div>
    </div>
  );
}
