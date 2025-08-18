import { authMiddleware } from "@clerk/nextjs";
import { NextFetchEvent, NextMiddleware, NextRequest, NextResponse } from 'next/server';
import { isDevelopment, isPlayground } from "./store/util";

const productionMiddleware: NextMiddleware = authMiddleware({});

const noOpMiddleware: NextMiddleware = (req: NextRequest, ev: NextFetchEvent) => {
  return NextResponse.next();
};

const middleware: NextMiddleware = isDevelopment() || isPlayground() ? noOpMiddleware : productionMiddleware;

export default middleware;

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
