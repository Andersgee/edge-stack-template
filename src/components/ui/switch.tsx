"use client";

import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "#src/utils/cn";
import { focusVisibleStyles } from "./styles";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex  h-[24px] w-[44px] shrink-0 cursor-pointer items-center rounded-full border-2 border-theme-neutral-200 transition-colors disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-theme-primary-500 data-[state=unchecked]:bg-theme-primary-100",
      focusVisibleStyles,
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-theme-primary-600 shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
