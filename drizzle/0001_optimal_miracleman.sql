CREATE TABLE `readme_generations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectName` varchar(255) NOT NULL DEFAULT '',
	`stack` json NOT NULL,
	`dependenciesCount` int NOT NULL DEFAULT 0,
	`scripts` json NOT NULL,
	`envVars` json NOT NULL,
	`deployment` json NOT NULL,
	`fileCount` int NOT NULL DEFAULT 0,
	`readme` text NOT NULL,
	`source` varchar(32) NOT NULL DEFAULT 'zip',
	`sourceLabel` varchar(512) NOT NULL DEFAULT '',
	`model` varchar(64) NOT NULL DEFAULT 'claude',
	`modelLabel` varchar(128) NOT NULL DEFAULT '',
	`templateName` varchar(80) NOT NULL DEFAULT '',
	`hasReference` tinyint NOT NULL DEFAULT 0,
	`context` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `readme_generations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `readme_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(80) NOT NULL,
	`content` text NOT NULL,
	`charCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `readme_templates_id` PRIMARY KEY(`id`)
);
