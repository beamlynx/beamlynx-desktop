import { authMiddleware } from "@clerk/nextjs";
import { NextFetchEvent, NextMiddleware, NextRequest, NextResponse } from 'next/server';
import { isDevelopment, isPlayground } from "./store/util";

const productionMiddleware: NextMiddleware = authMiddleware({});

const noOpMiddleware: NextMiddleware = (req: NextRequest, ev: NextFetchEvent) => {
  return NextResponse.next();
};

const middleware: NextMiddleware = (req: NextRequest, ev: NextFetchEvent) => {
  // Server-side environment detection
  const isDev = process.env.NODE_ENV === 'development';
  const hostname = req.nextUrl.hostname;
  const isPlaygroundServer = hostname.includes('playground');
  
  console.log('Middleware - hostname:', hostname, 'isDev:', isDev, 'isPlayground:', isPlaygroundServer);
  
  if (isDev || isPlaygroundServer) {
    console.log('Using noOpMiddleware (no auth)');
    return noOpMiddleware(req, ev);
  } else {
    console.log('Using productionMiddleware (Clerk auth)');
    return productionMiddleware(req, ev);
  }
};

export default middleware;

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
