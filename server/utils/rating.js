// server/utils/rating.js
// Helper functions for rating calculations and validation

/**
 * Calculate the average rating from an array of review documents.
 * Returns { average: Number, count: Number } where average is rounded to one decimal.
 */
export function calculateAverageRating(reviews) {
  const count = reviews.length;
  if (count === 0) return { average: 0, count };
  const total = reviews.reduce((sum, rev) => sum + rev.rating, 0);
  const avg = total / count;
  const average = Math.round(avg * 10) / 10; // one decimal place
  return { average, count };
}

/**
 * Validate that a rating is an integer between 1 and 5.
 * Throws an error with status 400 if invalid.
 */
export function validateRating(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1 || num > 5) {
    const err = new Error('Rating must be an integer between 1 and 5');
    err.status = 400;
    throw err;
  }
  return num;
}
