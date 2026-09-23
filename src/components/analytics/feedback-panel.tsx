import { MessageSquareQuote, Star } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { DoctorAnalytics } from "@/server/services/analytics";

/**
 * Spec §16 — the patient feedback summary.
 *
 * A rating distribution is one measure across five ordered buckets, so it is
 * one hue and a length, not five colours.
 */
export function FeedbackPanel({
  feedback,
}: {
  feedback: DoctorAnalytics["feedback"];
}) {
  const max = Math.max(1, ...feedback.distribution);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Patient feedback</CardTitle>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          {feedback.requested === 0
            ? "No feedback has been requested in this period."
            : `${feedback.responses} of ${feedback.requested} asked replied.`}
        </p>
      </CardHeader>

      <div className="px-5 pb-5">
        {feedback.responses === 0 ? (
          <p className="py-4 text-[13px] text-muted-foreground">
            Nothing to summarise yet. Feedback requests go out automatically
            after a consultation is completed.
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <p className="font-display text-3xl font-bold tabular">
                {feedback.averageRating}
              </p>
              <div
                className="flex items-center gap-0.5"
                role="img"
                aria-label={`${feedback.averageRating} out of 5`}
              >
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={
                      star <= Math.round(feedback.averageRating ?? 0)
                        ? "size-3.5 fill-accent text-accent"
                        : "size-3.5 text-muted-foreground/40"
                    }
                  />
                ))}
              </div>
              <span className="text-[12px] text-muted-foreground">
                out of 5
              </span>
            </div>

            <ul className="mt-4 space-y-1.5">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = feedback.distribution[star - 1];

                return (
                  <li key={star} className="flex items-center gap-2">
                    <span className="w-3 text-[11px] font-semibold tabular text-muted-foreground">
                      {star}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${(count / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-[11px] tabular text-muted-foreground">
                      {count}
                    </span>
                  </li>
                );
              })}
            </ul>

            {feedback.recentComments.length > 0 && (
              <ul className="mt-5 space-y-3 border-t border-border pt-4">
                {feedback.recentComments.map((comment, index) => (
                  <li key={index} className="flex gap-2.5">
                    <MessageSquareQuote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-[13px] leading-snug">
                        {comment.comment}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {comment.rating}/5 ·{" "}
                        {comment.at.toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
