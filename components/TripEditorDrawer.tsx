"use client";

import { useState, useTransition } from "react";
import { NeonButton } from "@/components/NeonButton";

type TripEditorDrawerProps = {
  action: (formData: FormData) => void | Promise<void>;
  trip: {
    id: string;
    slug: string;
    title: string;
    location: string;
    summary: string;
    content: string;
    startDate: string;
    endDate: string;
    mapX: number;
    mapY: number;
    latitude: number | null;
    longitude: number | null;
    missionStatus: "MISSION_COMPLETE" | "MISSION_OBJECTIVE";
    badgeName: string;
    stampLabel: string;
    published: boolean;
  };
};

export function TripEditorDrawer({ action, trip }: TripEditorDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      await action(formData);
      setIsOpen(false);
    });
  };

  return (
    <>
      <div className="trip-editor-trigger-wrap">
        <NeonButton type="button" className="trip-editor-trigger" onClick={() => setIsOpen(true)}>
          Edit Trip
        </NeonButton>
      </div>

      <div className={`trip-editor-drawer${isOpen ? " trip-editor-drawer--open" : ""}`} aria-hidden={!isOpen}>
        <button
          type="button"
          className="trip-editor-drawer__scrim"
          aria-label="Close trip editor"
          onClick={() => setIsOpen(false)}
          disabled={isPending}
        />
        <aside className="trip-editor-drawer__panel" role="dialog" aria-modal="true" aria-labelledby="trip-editor-title">
          <header className="trip-editor-drawer__header">
            <h2 id="trip-editor-title">Edit Trip Details</h2>
            <NeonButton type="button" onClick={() => setIsOpen(false)} disabled={isPending}>
              Close
            </NeonButton>
          </header>

          <form action={handleSubmit} className="form-grid trip-editor-form">
            <input type="hidden" name="tripId" value={trip.id} />
            <input type="hidden" name="currentSlug" value={trip.slug} />

            <label>
              Title
              <input name="title" defaultValue={trip.title} required />
            </label>

            <label>
              Location
              <input name="location" defaultValue={trip.location} required />
            </label>

            <label>
              Summary
              <input name="summary" defaultValue={trip.summary} required />
            </label>

            <label>
              Start Date
              <input name="startDate" type="date" defaultValue={trip.startDate} required />
            </label>

            <label>
              End Date
              <input name="endDate" type="date" defaultValue={trip.endDate} required />
            </label>

            <label>
              Map X
              <input name="mapX" type="number" min={0} max={100} defaultValue={trip.mapX} required />
            </label>

            <label>
              Map Y
              <input name="mapY" type="number" min={0} max={100} defaultValue={trip.mapY} required />
            </label>

            <label>
              Latitude
              <input
                name="latitude"
                type="number"
                min={-90}
                max={90}
                step="any"
                defaultValue={trip.latitude ?? ""}
              />
            </label>

            <label>
              Longitude
              <input
                name="longitude"
                type="number"
                min={-180}
                max={180}
                step="any"
                defaultValue={trip.longitude ?? ""}
              />
            </label>

            <label>
              Mission Status
              <select name="missionStatus" defaultValue={trip.missionStatus}>
                <option value="MISSION_COMPLETE">Mission complete (pink)</option>
                <option value="MISSION_OBJECTIVE">Mission objective (green live)</option>
              </select>
            </label>

            <label>
              Badge Name
              <input name="badgeName" defaultValue={trip.badgeName} required />
            </label>

            <label>
              Stamp Label
              <input name="stampLabel" defaultValue={trip.stampLabel} required />
            </label>

            <label className="trip-editor-form__published">
              <input name="published" type="checkbox" defaultChecked={trip.published} />
              Published
            </label>

            <label>
              Description
              <textarea name="content" defaultValue={trip.content} required />
            </label>

            <div className="trip-editor-form__actions">
              <NeonButton type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save Trip"}
              </NeonButton>
            </div>
          </form>
        </aside>
      </div>
    </>
  );
}
