import { authMiddleware } from "@clerk/nextjs";
import { NextFetchEvent, NextMiddleware, NextRequest, NextResponse } from 'next/server';

const productionMiddleware: NextMiddleware = authMiddleware({});

const noOpMiddleware: NextMiddleware = (req: NextRequest, ev: NextFetchEvent) => {
  return NextResponse.next();
};

const middleware: NextMiddleware = process.env.NODE_ENV !== 'development' ? productionMiddleware : noOpMiddleware;

export default middleware;

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
