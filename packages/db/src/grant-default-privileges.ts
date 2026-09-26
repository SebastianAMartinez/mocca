import "dotenv/config";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	throw new Error("DATABASE_URL is not defined");
}

const runtimeRole = "mocca_app";
const client = new Client({ connectionString: databaseUrl });

try {
	await client.connect();

	const result = await client.query(
		"SELECT current_user AS migration_role, EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS runtime_role_exists",
		[runtimeRole],
	);
	const migrationRole = result.rows[0]?.migration_role as string | undefined;

	if (!result.rows[0]?.runtime_role_exists) {
		throw new Error(`Database role ${runtimeRole} does not exist`);
	}

	if (migrationRole === runtimeRole) {
		throw new Error(
			"Migrations must use a role separate from the runtime role",
		);
	}

	await client.query(
		`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${runtimeRole}`,
	);
	await client.query(
		`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${runtimeRole}`,
	);

	console.log(
		`Configured default table and sequence privileges for ${runtimeRole} on objects created by ${migrationRole}`,
	);
} finally {
	await client.end();
}
