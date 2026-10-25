import * as React from "react";
import { cn } from "@/lib/utils";
const Separator = React.forwardRef<HTMLHRElement, React.HTMLAttributes<HTMLHRElement>>(({ className, ...props }, ref) => (
  <hr ref={ref} className={cn("shrink-0 bg-border h-[1px] w-full border-0", className)} {...props} />
));
Separator.displayName = "Separator";
export { Separator };
