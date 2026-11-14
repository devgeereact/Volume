/** What the Data and backups panel says about where books are saved, from the database the server reports. */
export function databaseWords(client: string | undefined): { label: string; intro: string } {
  if (client === "mysql") {
    return { label: "MySQL on cPanel", intro: "Books save to the Volume database on your cPanel host." };
  }
  if (client === "sqlite") {
    return { label: "SQLite on this computer", intro: "Books save to the Volume database on this computer." };
  }
  return { label: "Loading", intro: "Books save to the Volume database." };
}
