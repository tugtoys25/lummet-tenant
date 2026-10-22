// Shared by the API route groups: response builders, validation and small checks.

export const NOT_HANDLED = Symbol("not-handled");

export function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}

export function success(data = {}) {

    return json({
        success: true,
        ...data
    });

}

export function failure(message, status = 400) {

    return json({
        success: false,
        error: message
    }, status);

}

export function validate(body, required) {

    for (const field of required) {

        if (
            body[field] === undefined ||
            body[field] === null ||
            body[field] === ""
        ) {
            throw new Error(`${field} is required`);
        }

    }

}

export function requireAdmin(user) {
  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }
  return null;
}
