import { useEffect } from "react";
import { useCapbim } from "@/lib/capbim/store";

export function CapbimBoot() {
  const hydrate = useCapbim((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  return null;
}
