"use client";

import {
  pointerWithin,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
  type Announcements,
} from "@dnd-kit/core";

// Pointer drops outside a column cancel; keyboard moves target a whole column.
export const stageBoardCollision: CollisionDetection = (args) =>
  pointerWithin({
    ...args,
    pointerCoordinates: args.pointerCoordinates ?? {
      x: args.collisionRect.left + args.collisionRect.width / 2,
      y: args.collisionRect.top + args.collisionRect.height / 2,
    },
  });

export const stageBoardKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { context, currentCoordinates },
) => {
  if (!["ArrowLeft", "ArrowRight"].includes(event.code)) return;
  event.preventDefault();
  const { collisionRect, droppableRects, droppableContainers, over } = context;
  if (!collisionRect || !over) return;
  const columns = droppableContainers
    .getEnabled()
    .flatMap((container) => {
      const rect = droppableRects.get(container.id);
      return rect ? [{ id: container.id, rect }] : [];
    })
    .sort((a, b) => a.rect.left - b.rect.left);
  const index = columns.findIndex((column) => column.id === over.id);
  if (index < 0) return;
  const target = columns[index + (event.code === "ArrowRight" ? 1 : -1)];
  if (!target) return;
  const centerX = collisionRect.left + collisionRect.width / 2;
  const centerY = collisionRect.top + collisionRect.height / 2;
  const targetY = Math.max(
    target.rect.top + 1,
    Math.min(centerY, target.rect.bottom - 1),
  );
  return {
    x:
      currentCoordinates.x + target.rect.left + target.rect.width / 2 - centerX,
    y: currentCoordinates.y + targetY - centerY,
  };
};

export function useStageBoardSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: stageBoardKeyboardCoordinates,
      // A drop immediately after an arrow must use the destination column,
      // rather than a position partway through a smooth scroll.
      scrollBehavior: "auto",
    }),
  );
}

export const stageBoardInstructions = {
  draggable:
    "To pick up a card, press space or enter. Use the left and right arrow keys to move between stages. Press space or enter to drop, or escape to cancel.",
};

export const stageBoardAnnouncements: Announcements = {
  onDragStart: ({ active }) =>
    `Picked up ${String(active.data.current?.label ?? "card")}.`,
  onDragOver: ({ over }) =>
    over
      ? `Over ${String(over.data.current?.label ?? "stage")}.`
      : "Outside the board. Release to cancel.",
  onDragEnd: ({ active, over }) =>
    over
      ? `Dropped ${String(active.data.current?.label ?? "card")} in ${String(over.data.current?.label ?? "stage")}.`
      : "Move cancelled.",
  onDragCancel: () => "Move cancelled.",
};

// Moving between columns remounts the card. dnd-kit's original activator
// can be detached by the time it restores focus; find the current handle.
export function restoreStageBoardFocus(id: string, stage: string) {
  requestAnimationFrame(() => {
    if (document.activeElement !== document.body) return;
    const handle = document.querySelector<HTMLElement>(
      `[data-stage-card-handle="${CSS.escape(id)}"]`,
    );
    const column = document.querySelector<HTMLElement>(
      `[data-stage-column="${CSS.escape(stage)}"]`,
    );
    (handle ?? column?.querySelector<HTMLElement>("button") ?? column)?.focus({
      preventScroll: true,
    });
  });
}
