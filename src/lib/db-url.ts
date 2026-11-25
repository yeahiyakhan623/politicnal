export function normalizePostgresConnectionString(connectionString: string) {
  const url = new URL(connectionString);
  if (url.searchParams.get("sslmode")?.toLowerCase() !== "require") {
    return connectionString;
  }

  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}
