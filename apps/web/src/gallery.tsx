"use client";

import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Play,
  Share2,
  X,
} from "lucide-react";
import { useRef, useState } from "react";

type Item = { id: string; src: string; alt: string; kind: "IMAGE" | "VIDEO" };

export function Gallery({ items }: { items: Item[] }) {
  const [index, setIndex] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const item = items[index];
  if (!item) return <div className="state">No media available.</div>;
  return (
    <section
      className="gallery cuv-gallery"
      aria-label="Listing gallery"
      onKeyDown={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("video,dialog")
        )
          return;
        if (
          items.length > 1 &&
          (event.key === "ArrowLeft" || event.key === "ArrowRight")
        ) {
          event.preventDefault();
          setIndex(
            (current) =>
              (current + (event.key === "ArrowRight" ? 1 : -1) + items.length) %
              items.length,
          );
        }
      }}
    >
      <div className="cuv-gallery-stage">
        {item.kind === "IMAGE" ? (
          <button
            type="button"
            className="hero-media"
            onClick={() => dialog.current?.showModal()}
            aria-label="Enlarge image"
          >
            <img
              key={item.id}
              src={item.src}
              alt={item.alt}
              width={960}
              height={630}
            />
            <span className="cuv-gallery-zoom">
              <Maximize2 size={17} aria-hidden="true" /> Enlarge
            </span>
          </button>
        ) : (
          <video
            className="hero-media"
            key={item.id}
            src={item.src}
            controls
            preload="metadata"
            aria-label={item.alt}
          />
        )}
        {items.length > 1 && (
          <div className="cuv-gallery-controls">
            <button
              type="button"
              aria-label="Previous media"
              onClick={() =>
                setIndex((index + items.length - 1) % items.length)
              }
            >
              <ChevronLeft size={20} />
            </button>
            <span aria-live="polite">
              {index + 1} / {items.length}
            </span>
            <button
              type="button"
              aria-label="Next media"
              onClick={() => setIndex((index + 1) % items.length)}
            >
              <ChevronRight size={20} />
            </button>
          </div>
        )}
      </div>
      {items.length > 1 && (
        <div className="gallery-nav" aria-label="Gallery controls">
          {items.map((entry, position) => (
            <button
              type="button"
              key={entry.id}
              aria-pressed={position === index}
              onClick={() => setIndex(position)}
            >
              {entry.kind === "IMAGE" ? (
                <img
                  src={entry.src}
                  alt=""
                  loading="lazy"
                  width={90}
                  height={62}
                />
              ) : (
                <Play size={19} aria-hidden="true" />
              )}
              <span className="sr-only">
                {entry.kind === "IMAGE" ? "Photo" : "Video"} {position + 1}
              </span>
            </button>
          ))}
        </div>
      )}
      <dialog ref={dialog} aria-label="Enlarged listing image" className="zoom">
        <form method="dialog">
          <button className="button button-light" autoFocus>
            <X size={16} aria-hidden="true" /> Close image
          </button>
        </form>
        {item.kind === "IMAGE" && (
          <img src={item.src} alt={item.alt} width={960} height={630} />
        )}
      </dialog>
    </section>
  );
}

export function Share({ title, url }: { title: string; url: string }) {
  const [status, setStatus] = useState("");
  const [manual, setManual] = useState(false);
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title, url });
      else {
        await navigator.clipboard.writeText(url);
        setStatus("Link copied.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setManual(true);
    }
  }
  return (
    <div>
      <button className="button button-light" onClick={() => void share()}>
        <Share2 size={16} aria-hidden="true" /> Share listing
      </button>
      {manual && (
        <label className="share-url">
          Listing link
          <input
            value={url}
            readOnly
            onFocus={(event) => event.target.select()}
          />
        </label>
      )}
      <span role="status">{status}</span>
    </div>
  );
}
