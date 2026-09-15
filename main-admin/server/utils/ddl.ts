// GENERATED from server/utils/schema.sql by server/scripts/sync-ddl.mjs — edit the .sql, not this file.
export const CONTROL_PLANE_DDL = `-- nuadmin control plane (main admin). Idempotent: re-applied on every boot.
-- Note: reserved words are avoided on purpose (res_key / col_key / uniq).

CREATE TABLE IF NOT EXISTS \`user\` (
  \`id\`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  \`username\`      VARCHAR(64)  NOT NULL UNIQUE,
  \`password\`      VARCHAR(255) NOT NULL,
  \`nickname\`      VARCHAR(64)  NOT NULL DEFAULT '',
  \`avatar\`        VARCHAR(255) NOT NULL DEFAULT '',
  \`status\`        TINYINT      NOT NULL DEFAULT 1 COMMENT '1=on 0=off',
  \`last_login_at\` DATETIME     NULL,
  \`created_at\`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Casbin policy store (standard adapter shape)
CREATE TABLE IF NOT EXISTS \`casbin_rule\` (
  \`id\`    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  \`ptype\` VARCHAR(8)   NOT NULL DEFAULT '',
  \`v0\`    VARCHAR(128) NOT NULL DEFAULT '',
  \`v1\`    VARCHAR(128) NOT NULL DEFAULT '',
  \`v2\`    VARCHAR(128) NOT NULL DEFAULT '',
  \`v3\`    VARCHAR(128) NOT NULL DEFAULT '',
  \`v4\`    VARCHAR(64)  NOT NULL DEFAULT '',
  \`v5\`    VARCHAR(64)  NOT NULL DEFAULT '',
  KEY \`idx_ptype\` (\`ptype\`),
  KEY \`idx_v0\` (\`v0\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sub-admin registry. One row == one standalone generated Nuxt project.
CREATE TABLE IF NOT EXISTS \`tenant\` (
  \`id\`           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  \`slug\`         VARCHAR(64)  NOT NULL UNIQUE COMMENT '[a-z0-9-]',
  \`name\`         VARCHAR(128) NOT NULL,
  \`description\`  VARCHAR(512) NOT NULL DEFAULT '',
  \`db_name\`      VARCHAR(64)  NOT NULL,
  \`port\`         INT          NOT NULL,
  \`jwt_secret\`   VARCHAR(128) NOT NULL,
  \`status\`       VARCHAR(24)  NOT NULL DEFAULT 'draft' COMMENT 'draft|generated|running|stopped|failed',
  \`app_title\`    VARCHAR(128) NOT NULL DEFAULT '',
  \`auth_mode\`    VARCHAR(16)  NOT NULL DEFAULT '' COMMENT 'simple|users|rbac; empty = not chosen yet, blocks generation',
  \`auth_config\`  JSON NULL COMMENT '门禁明细：simple 存密码、users 存成员、rbac 存成员+角色矩阵',
  \`theme_json\`   JSON NULL,
  \`login_tpl\`    VARCHAR(32)  NOT NULL DEFAULT 'split',
  \`layout\`       VARCHAR(32)  NOT NULL DEFAULT 'side',
  \`version\`      INT          NOT NULL DEFAULT 0,
  \`project_path\` VARCHAR(512) NOT NULL DEFAULT '',
  \`created_at\`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`generated_at\` DATETIME     NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 建模站: group == one menu branch inside the sub-admin
CREATE TABLE IF NOT EXISTS \`model_group\` (
  \`id\`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  \`tenant_id\`  INT UNSIGNED NOT NULL,
  \`name\`       VARCHAR(64)  NOT NULL,
  \`icon\`       VARCHAR(32)  NOT NULL DEFAULT '📁',
  \`sort\`       INT          NOT NULL DEFAULT 0,
  \`created_at\` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY \`idx_tenant\` (\`tenant_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 建模站: module == one business table + one CRUD page pair
CREATE TABLE IF NOT EXISTS \`module\` (
  \`id\`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  \`group_id\`    INT UNSIGNED NOT NULL,
  \`tenant_id\`   INT UNSIGNED NOT NULL,
  \`name\`        VARCHAR(64)  NOT NULL,
  \`res_key\`     VARCHAR(64)  NOT NULL COMMENT 'camelCase resource key',
  \`table_name\`  VARCHAR(64)  NOT NULL,
  \`icon\`        VARCHAR(32)  NOT NULL DEFAULT '📄',
  \`comment\`     VARCHAR(255) NOT NULL DEFAULT '',
  \`sort\`        INT          NOT NULL DEFAULT 0,
  \`design_json\` JSON NULL COMMENT '设计站',
  \`logic_json\`  JSON NULL COMMENT '逻辑站',
  \`seed_json\`   JSON NULL COMMENT '数据站',
  \`created_at\`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY \`idx_group\` (\`group_id\`),
  KEY \`idx_tenant\` (\`tenant_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`module_field\` (
  \`id\`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  \`module_id\`  INT UNSIGNED NOT NULL,
  \`name\`       VARCHAR(64)  NOT NULL COMMENT 'label',
  \`col_key\`    VARCHAR(64)  NOT NULL COMMENT 'column name',
  \`type\`       VARCHAR(32)  NOT NULL,
  \`length\`     INT          NOT NULL DEFAULT 64,
  \`precision\`  INT          NOT NULL DEFAULT 2,
  \`nullable\`   TINYINT      NOT NULL DEFAULT 1,
  \`uniq\`       TINYINT      NOT NULL DEFAULT 0,
  \`indexed\`    TINYINT      NOT NULL DEFAULT 0,
  \`pk\`         TINYINT      NOT NULL DEFAULT 0,
  \`default_v\`  VARCHAR(255) NULL,
  \`dict_key\`   VARCHAR(64)  NOT NULL DEFAULT '',
  \`ref_table\`  VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '数据源：关联表',
  \`ref_label\`  VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '数据源：显示字段，留空自动挑',
  \`ref_value\`  VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '数据源：值字段，留空用主键',
  \`component\`  VARCHAR(32)  NOT NULL DEFAULT 'input',
  \`list_show\`  TINYINT      NOT NULL DEFAULT 1,
  \`form_show\`  TINYINT      NOT NULL DEFAULT 1,
  \`detail_show\` TINYINT     NOT NULL DEFAULT 1 COMMENT '前端详情',
  \`export_show\` TINYINT     NOT NULL DEFAULT 0 COMMENT '导入/导出列',
  \`sortable\`    TINYINT     NOT NULL DEFAULT 0 COMMENT '列表可排序',
  \`clearable\`   TINYINT     NOT NULL DEFAULT 1 COMMENT '更新时允许置空',
  \`query_type\` VARCHAR(16)  NOT NULL DEFAULT 'eq' COMMENT 'none|eq|ne|like|gt|ge|lt|le|in|range|notnull',
  \`query_hidden\` TINYINT    NOT NULL DEFAULT 0 COMMENT '不进搜索栏但仍可作筛选',
  \`required\`   TINYINT      NOT NULL DEFAULT 0,
  \`rule\`       VARCHAR(64)  NOT NULL DEFAULT '',
  \`rule_msg\`   VARCHAR(255) NOT NULL DEFAULT '' COMMENT '校验失败文案',
  \`index_type\` VARCHAR(16)  NOT NULL DEFAULT 'none' COMMENT 'none|normal|unique|primary，取代 indexed/uniq/pk 三布尔',
  \`remark\`     VARCHAR(255) NOT NULL DEFAULT '',
  \`sort\`       INT          NOT NULL DEFAULT 0,
  KEY \`idx_module\` (\`module_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 能力库
CREATE TABLE IF NOT EXISTS \`capability\` (
  \`id\`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  \`cap_key\`    VARCHAR(64)  NOT NULL UNIQUE,
  \`name\`       VARCHAR(64)  NOT NULL,
  \`icon\`       VARCHAR(16)  NOT NULL DEFAULT '🧩',
  \`category\`   VARCHAR(32)  NOT NULL DEFAULT 'general',
  \`version\`    VARCHAR(16)  NOT NULL DEFAULT '1.0.0',
  \`summary\`    VARCHAR(512) NOT NULL DEFAULT '',
  \`spec_json\`  JSON NULL,
  \`created_at\` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`tenant_capability\` (
  \`id\`           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  \`tenant_id\`    INT UNSIGNED NOT NULL,
  \`cap_key\`      VARCHAR(64)  NOT NULL,
  \`version\`      VARCHAR(16)  NOT NULL,
  \`config_json\`  JSON NULL,
  \`status\`       VARCHAR(16)  NOT NULL DEFAULT 'installed',
  \`installed_at\` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY \`uk_tenant_cap\` (\`tenant_id\`, \`cap_key\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 生成站
CREATE TABLE IF NOT EXISTS \`gen_job\` (
  \`id\`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  \`tenant_id\`   INT UNSIGNED NOT NULL,
  \`version\`     INT          NOT NULL DEFAULT 0,
  \`kind\`        VARCHAR(24)  NOT NULL DEFAULT 'generate',
  \`status\`      VARCHAR(16)  NOT NULL DEFAULT 'running',
  \`message\`     VARCHAR(512) NOT NULL DEFAULT '',
  \`git_commit\`   VARCHAR(32)  NOT NULL DEFAULT '' COMMENT 'git snapshot this job produced',
  \`log\`         MEDIUMTEXT NULL,
  \`files_json\`  JSON NULL,
  \`created_at\`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`finished_at\` DATETIME     NULL,
  KEY \`idx_tenant\` (\`tenant_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 验证站
CREATE TABLE IF NOT EXISTS \`verify_run\` (
  \`id\`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  \`tenant_id\`  INT UNSIGNED NOT NULL,
  \`job_id\`     INT UNSIGNED NULL,
  \`case_key\`   VARCHAR(64)  NOT NULL,
  \`title\`      VARCHAR(128) NOT NULL DEFAULT '',
  \`status\`     VARCHAR(16)  NOT NULL DEFAULT 'pass',
  \`detail\`     TEXT NULL,
  \`duration\`   INT          NOT NULL DEFAULT 0,
  \`created_at\` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY \`idx_tenant\` (\`tenant_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AI创作
CREATE TABLE IF NOT EXISTS \`ai_session\` (
  \`id\`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  \`tenant_id\`  INT UNSIGNED NULL,
  \`user_id\`    INT UNSIGNED NOT NULL,
  \`title\`      VARCHAR(128) NOT NULL DEFAULT '新对话',
  \`created_at\` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`ai_message\` (
  \`id\`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  \`session_id\` INT UNSIGNED NOT NULL,
  \`role\`       VARCHAR(16)  NOT NULL,
  \`content\`    MEDIUMTEXT NULL,
  \`intent\`     VARCHAR(32)  NOT NULL DEFAULT 'chat',
  \`payload\`    JSON NULL,
  \`created_at\` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY \`idx_session\` (\`session_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`login_log\` (
  \`id\`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  \`username\`   VARCHAR(64)  NOT NULL DEFAULT '',
  \`ok\`         TINYINT      NOT NULL DEFAULT 1,
  \`ip\`         VARCHAR(64)  NOT NULL DEFAULT '',
  \`ua\`         VARCHAR(255) NOT NULL DEFAULT '',
  \`created_at\` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 数据字典定义。控制面是唯一来源，生成期 seed 进子后台的 sys_dict_type / sys_dict_data。
CREATE TABLE IF NOT EXISTS \`dict_type\` (
  \`id\`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  \`tenant_id\`  INT UNSIGNED NOT NULL,
  \`dict_key\`   VARCHAR(64)  NOT NULL COMMENT '字典编码，对应子后台 sys_dict_type.dict_key',
  \`name\`       VARCHAR(64)  NOT NULL COMMENT '字典名称',
  \`remark\`     VARCHAR(255) NOT NULL DEFAULT '',
  \`updated_at\` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY \`uk_tenant_key\` (\`tenant_id\`, \`dict_key\`),
  KEY \`idx_tenant\` (\`tenant_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`dict_item\` (
  \`id\`      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  \`type_id\` INT UNSIGNED NOT NULL,
  \`label\`   VARCHAR(64)  NOT NULL,
  \`value\`   VARCHAR(64)  NOT NULL,
  \`color\`   VARCHAR(16)  NOT NULL DEFAULT '' COMMENT 'ok|warn|err，子后台标签配色',
  \`sort\`    INT          NOT NULL DEFAULT 0,
  \`enabled\` TINYINT      NOT NULL DEFAULT 1,
  UNIQUE KEY \`uk_type_value\` (\`type_id\`, \`value\`),
  KEY \`idx_type\` (\`type_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;
