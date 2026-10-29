"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import type { ReactNode } from "react";
import { PixelIcon } from "./pixel-icon";

export type SelectOption = {
  value: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
};

export type SelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  groups?: { label: string; options: SelectOption[] }[];
  className?: string;
  disabled?: boolean;
};

export function Select({
  label,
  value,
  onChange,
  options,
  groups = [],
  className = "",
  disabled,
}: SelectProps) {
  const selected = [
    ...options,
    ...groups.flatMap((group) => group.options),
  ].find((option) => option.value === value);
  const item = (option: SelectOption) => (
    <SelectPrimitive.Item
      key={option.value}
      value={option.value}
      textValue={option.label}
      disabled={option.disabled}
      className="select-option"
    >
      {option.icon && (
        <span className="select-option-icon" aria-hidden="true">
          {option.icon}
        </span>
      )}
      <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="select-check">
        <PixelIcon name="check" size={12} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        aria-label={label}
        className={`select-trigger ${className}`}
      >
        {selected?.icon && (
          <span className="select-option-icon" aria-hidden="true">
            {selected.icon}
          </span>
        )}
        <SelectPrimitive.Value>
          {selected?.label ?? label}
        </SelectPrimitive.Value>
        <SelectPrimitive.Icon className="select-chevron">
          <PixelIcon name="chevron" size={12} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          aria-label={label}
          className="select-menu"
          position="popper"
          sideOffset={6}
          collisionPadding={12}
        >
          <SelectPrimitive.ScrollUpButton className="select-scroll select-scroll-up">
            <PixelIcon name="chevron" size={12} />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="select-viewport">
            {options.map(item)}
            {groups.map((group) => (
              <SelectPrimitive.Group key={group.label}>
                <SelectPrimitive.Label className="select-group-label">
                  {group.label}
                </SelectPrimitive.Label>
                {group.options.map(item)}
              </SelectPrimitive.Group>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="select-scroll">
            <PixelIcon name="chevron" size={12} />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
