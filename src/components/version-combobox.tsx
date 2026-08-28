import { useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export interface VersionOption {
  value: string;
  label: string;
  badge?: string;
}

interface VersionComboboxProps {
  value: string | null;
  onChange: (value: string) => void;
  options: VersionOption[];
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  emptyText?: string;
}

/** Searchable version picker (Minecraft/loader builds) — plain shadcn combobox
 *  pattern (Popover + Command), needed because the Minecraft release list alone
 *  runs to several hundred entries that a plain <Select> would be unusable for. */
export function VersionCombobox({
  value,
  onChange,
  options,
  loading,
  disabled,
  placeholder = "Selecciona una versión",
  emptyText = "Sin resultados.",
}: VersionComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {loading ? "Cargando…" : selected ? selected.label : placeholder}
          </span>
          {loading ? (
            <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" />
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Buscar versión…" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("h-4 w-4", value === option.value ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1 truncate">{option.label}</span>
                  {option.badge && (
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {option.badge}
                    </Badge>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
