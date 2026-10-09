"use client";
import { useRef } from "react";
import {
  pointerWithin,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core";

export const pipelineCollision: CollisionDetection = (args) => {
  const point = args.pointerCoordinates ?? {
    x: args.collisionRect.left + args.collisionRect.width / 2,
    y: args.collisionRect.top + args.collisionRect.height / 2,
  };
  const hits = pointerWithin({ ...args, pointerCoordinates: point });
  const column = hits.find(
    (hit) =>
      args.droppableContainers.find((item) => item.id === hit.id)?.data.current
        ?.kind === "column",
  );
  if (!column) return [];
  const slots = args.droppableContainers.filter(
    (item) =>
      item.data.current?.kind === "slot" &&
      item.data.current.stage === column.id,
  );
  const closest = slots
    .map((item) => ({ item, rect: args.droppableRects.get(item.id) }))
    .filter((row) => row.rect)
    .sort(
      (a, b) =>
        Math.abs(a.rect!.top + a.rect!.height / 2 - point.y) -
        Math.abs(b.rect!.top + b.rect!.height / 2 - point.y),
    )[0];
  return [{ id: closest?.item.id ?? column.id }];
};

function keyboardCoordinates(
  select: (id: UniqueIdentifier) => void,
): KeyboardCoordinateGetter {
  return (event, { context, currentCoordinates }) => {
    if (
      !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)
    )
      return;
    event.preventDefault();
    const { over, collisionRect, droppableContainers, droppableRects } =
      context;
    if (!over || !collisionRect) return;
    const enabled = droppableContainers.getEnabled();
    const stage = (over.data.current?.stage ?? over.id) as string;
    const centerY = collisionRect.top + collisionRect.height / 2;
    let target;
    const slots = enabled
      .filter(
        (item) =>
          item.data.current?.kind === "slot" &&
          item.data.current.stage === stage,
      )
      .sort(
        (a, b) =>
          (droppableRects.get(a.id)?.top ?? 0) -
          (droppableRects.get(b.id)?.top ?? 0),
      );
    if (event.code === "ArrowUp" || event.code === "ArrowDown") {
      const index = slots.findIndex((item) => item.id === over.id);
      target = slots[index + (event.code === "ArrowDown" ? 1 : -1)];
    } else {
      const columns = enabled
        .filter((item) => item.data.current?.kind === "column")
        .sort(
          (a, b) =>
            (droppableRects.get(a.id)?.left ?? 0) -
            (droppableRects.get(b.id)?.left ?? 0),
        );
      const index = columns.findIndex((item) => item.id === stage);
      const next = columns[index + (event.code === "ArrowRight" ? 1 : -1)];
      if (!next) return;
      target =
        enabled
          .filter(
            (item) =>
              item.data.current?.kind === "slot" &&
              item.data.current.stage === next.id,
          )
          .sort(
            (a, b) =>
              Math.abs((droppableRects.get(a.id)?.top ?? 0) - centerY) -
              Math.abs((droppableRects.get(b.id)?.top ?? 0) - centerY),
          )[0] ?? next;
    }
    const rect = target && droppableRects.get(target.id);
    if (!rect || !target) return;
    select(target.id);
    return {
      x:
        currentCoordinates.x +
        rect.left +
        rect.width / 2 -
        (collisionRect.left + collisionRect.width / 2),
      y: currentCoordinates.y + rect.top + rect.height / 2 - centerY,
    };
  };
}

export function usePipelineDragDrop() {
  const keyboardTarget = useRef<UniqueIdentifier | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates((id) => {
        keyboardTarget.current = id;
      }),
      scrollBehavior: "auto",
    }),
  );
  const collisionDetection: CollisionDetection = (args) => {
    // Keyboard arrows choose a discrete insertion slot. Keep that intent exact
    // even when the overlay differs in height from the original card.
    if (
      keyboardTarget.current != null &&
      args.droppableContainers.some(
        (item) => item.id === keyboardTarget.current,
      )
    )
      return [{ id: keyboardTarget.current }];
    return pipelineCollision(args);
  };
  return {
    sensors,
    collisionDetection,
    reset: () => {
      keyboardTarget.current = null;
    },
  };
}
export const pipelineInstructions = {
  draggable:
    "Press space or enter to pick up a card. Use up and down arrows to choose its position, or left and right to change stages. Press space or enter to drop, or escape to cancel.",
};
