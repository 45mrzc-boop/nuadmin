-- MySQL dump 10.13  Distrib 8.0.46, for Linux (x86_64)
--
-- Host: mysql-db    Database: nuadmin
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Current Database: `nuadmin`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `nuadmin` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;

USE `nuadmin`;

--
-- Table structure for table `ai_message`
--

DROP TABLE IF EXISTS `ai_message`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ai_message` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `session_id` int unsigned NOT NULL,
  `role` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` mediumtext COLLATE utf8mb4_unicode_ci,
  `intent` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'chat',
  `payload` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_session` (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ai_message`
--

LOCK TABLES `ai_message` WRITE;
/*!40000 ALTER TABLE `ai_message` DISABLE KEYS */;
/*!40000 ALTER TABLE `ai_message` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ai_session`
--

DROP TABLE IF EXISTS `ai_session`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ai_session` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int unsigned DEFAULT NULL,
  `user_id` int unsigned NOT NULL,
  `title` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '新对话',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ai_session`
--

LOCK TABLES `ai_session` WRITE;
/*!40000 ALTER TABLE `ai_session` DISABLE KEYS */;
/*!40000 ALTER TABLE `ai_session` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `biz_device`
--

DROP TABLE IF EXISTS `biz_device`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `biz_device` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL,
  `created_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='设备';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `biz_device`
--

LOCK TABLES `biz_device` WRITE;
/*!40000 ALTER TABLE `biz_device` DISABLE KEYS */;
/*!40000 ALTER TABLE `biz_device` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `biz_goods`
--

DROP TABLE IF EXISTS `biz_goods`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `biz_goods` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `price` decimal(14,2) NOT NULL,
  `status` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cover` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `listed_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL,
  `created_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `flow_status` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT 'draft',
  `flow_node` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `title` (`title`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商品主表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `biz_goods`
--

LOCK TABLES `biz_goods` WRITE;
/*!40000 ALTER TABLE `biz_goods` DISABLE KEYS */;
/*!40000 ALTER TABLE `biz_goods` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `biz_rollback_probe`
--

DROP TABLE IF EXISTS `biz_rollback_probe`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `biz_rollback_probe` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL,
  `created_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `flow_status` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT 'draft',
  `flow_node` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT '',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='回滚探针';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `biz_rollback_probe`
--

LOCK TABLES `biz_rollback_probe` WRITE;
/*!40000 ALTER TABLE `biz_rollback_probe` DISABLE KEYS */;
/*!40000 ALTER TABLE `biz_rollback_probe` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `capability`
--

DROP TABLE IF EXISTS `capability`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `capability` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `cap_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `icon` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 0xF09FA7A9,
  `category` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'general',
  `version` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '1.0.0',
  `summary` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `spec_json` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cap_key` (`cap_key`)
) ENGINE=InnoDB AUTO_INCREMENT=771 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `capability`
--

LOCK TABLES `capability` WRITE;
/*!40000 ALTER TABLE `capability` DISABLE KEYS */;
INSERT INTO `capability` VALUES (1,'dict','数据字典','📚','system','1.2.0','枚举值集中维护，业务表下拉/标签自动联动，支持树形字典与颜色标记。','{\"apis\": [{\"path\": \"/api/dict/list\", \"method\": \"GET\", \"comment\": \"全部字典（登录后一次拉取，前端缓存）\"}, {\"path\": \"/api/dict/data/:key\", \"method\": \"GET\", \"comment\": \"按编码取字典项\"}], \"desc\": \"提供 sys_dict_type / sys_dict_data 两张表与 /api/dict 只读接口；建模站中 type=enum 且填写 dict 的字段自动改为读取字典。\", \"pages\": [{\"key\": \"dict\", \"icon\": \"📚\", \"name\": \"数据字典\", \"route\": \"/admin/system/dict\"}], \"config\": [{\"key\": \"cacheSeconds\", \"type\": \"number\", \"label\": \"字典缓存秒数\", \"default\": 300}], \"tables\": [{\"name\": \"sys_dict_type\", \"fields\": [{\"key\": \"id\", \"name\": \"主键\", \"type\": \"id\"}, {\"key\": \"dict_key\", \"name\": \"字典编码\", \"type\": \"varchar\", \"length\": 64, \"unique\": true, \"required\": true}, {\"key\": \"dict_name\", \"name\": \"字典名称\", \"type\": \"varchar\", \"length\": 64, \"required\": true}, {\"key\": \"remark\", \"name\": \"备注\", \"type\": \"varchar\", \"length\": 255}], \"comment\": \"字典类型\"}, {\"name\": \"sys_dict_data\", \"fields\": [{\"key\": \"id\", \"name\": \"主键\", \"type\": \"id\"}, {\"key\": \"dict_key\", \"name\": \"字典编码\", \"type\": \"varchar\", \"length\": 64, \"indexed\": true, \"required\": true}, {\"key\": \"label\", \"name\": \"标签\", \"type\": \"varchar\", \"length\": 64, \"required\": true}, {\"key\": \"value\", \"name\": \"值\", \"type\": \"varchar\", \"length\": 64, \"required\": true}, {\"key\": \"color\", \"name\": \"颜色\", \"type\": \"varchar\", \"length\": 16}, {\"key\": \"sort\", \"name\": \"排序\", \"type\": \"int\", \"default\": 0}, {\"key\": \"status\", \"name\": \"启用\", \"type\": \"bool\", \"default\": true}], \"comment\": \"字典项\"}], \"verify\": [\"登录后 /api/dict/list 返回 200\", \"enum 字段渲染为下拉且值可回显\"]}','2026-09-11 11:26:11'),(2,'log','操作日志','📝','system','1.1.0','自动记录写操作：谁、何时、改了哪条、改前改后差异。','{\"apis\": [{\"path\": \"/api/log/page\", \"method\": \"GET\", \"comment\": \"分页查询操作日志\"}], \"desc\": \"注册 nitro 中间件拦截 POST/PUT/DELETE，落库 sys_operation_log，并提供查询页。\", \"pages\": [{\"key\": \"log\", \"icon\": \"📝\", \"name\": \"操作日志\", \"route\": \"/admin/system/log\"}], \"config\": [{\"key\": \"keepDays\", \"type\": \"number\", \"label\": \"保留天数\", \"default\": 90}], \"tables\": [{\"name\": \"sys_operation_log\", \"fields\": [{\"key\": \"id\", \"name\": \"主键\", \"type\": \"id\"}, {\"key\": \"username\", \"name\": \"操作人\", \"type\": \"varchar\", \"length\": 64, \"indexed\": true}, {\"key\": \"module\", \"name\": \"模块\", \"type\": \"varchar\", \"length\": 64}, {\"key\": \"action\", \"name\": \"动作\", \"type\": \"varchar\", \"length\": 32}, {\"key\": \"path\", \"name\": \"路径\", \"type\": \"varchar\", \"length\": 255}, {\"key\": \"payload\", \"name\": \"入参\", \"type\": \"json\"}, {\"key\": \"result\", \"name\": \"结果\", \"type\": \"varchar\", \"length\": 32}, {\"key\": \"duration\", \"name\": \"耗时ms\", \"type\": \"int\", \"default\": 0}, {\"key\": \"ip\", \"name\": \"IP\", \"type\": \"varchar\", \"length\": 64}, {\"key\": \"created_at\", \"name\": \"时间\", \"type\": \"datetime\"}], \"comment\": \"操作日志\"}], \"verify\": [\"新增一条业务数据后日志页出现记录\"], \"middleware\": true}','2026-09-11 11:26:11'),(3,'file','文件上传','📎','media','1.3.0','本地磁盘/对象存储双驱动，图片自动压缩缩略图，业务字段直接引用文件 id。','{\"apis\": [{\"path\": \"/api/file/upload\", \"method\": \"POST\", \"comment\": \"multipart 上传，返回 {id,url}\"}, {\"path\": \"/api/file/:id\", \"method\": \"DELETE\", \"comment\": \"删除文件与磁盘对象\"}], \"desc\": \"生成 sys_file 表、/api/file/upload（multipart）与静态回源；type=image/file 的字段自动切换为上传组件。\", \"pages\": [{\"key\": \"file\", \"icon\": \"📎\", \"name\": \"附件管理\", \"route\": \"/admin/system/file\"}], \"config\": [{\"key\": \"driver\", \"type\": \"select\", \"label\": \"存储驱动\", \"default\": \"local\", \"options\": [\"local\", \"oss\", \"s3\"]}, {\"key\": \"maxMb\", \"type\": \"number\", \"label\": \"单文件大小上限(MB)\", \"default\": 20}, {\"key\": \"exts\", \"type\": \"text\", \"label\": \"允许扩展名\", \"default\": \"jpg,jpeg,png,gif,webp,pdf,doc,docx,xls,xlsx,zip\"}], \"tables\": [{\"name\": \"sys_file\", \"fields\": [{\"key\": \"id\", \"name\": \"主键\", \"type\": \"id\"}, {\"key\": \"name\", \"name\": \"原名\", \"type\": \"varchar\", \"length\": 255, \"required\": true}, {\"key\": \"store_key\", \"name\": \"存储键\", \"type\": \"varchar\", \"length\": 255, \"unique\": true}, {\"key\": \"size\", \"name\": \"大小\", \"type\": \"int\"}, {\"key\": \"mime\", \"name\": \"MIME\", \"type\": \"varchar\", \"length\": 64}, {\"key\": \"kind\", \"dict\": \"file_kind\", \"name\": \"类型\", \"type\": \"enum\", \"length\": 16}, {\"key\": \"uploader\", \"name\": \"上传人\", \"type\": \"varchar\", \"length\": 64}, {\"key\": \"created_at\", \"name\": \"上传时间\", \"type\": \"datetime\"}], \"comment\": \"文件\"}], \"verify\": [\"上传图片返回可访问 url\"]}','2026-09-11 11:26:11'),(4,'io','导入导出','🔁','data','1.0.2','列表页一键导出 CSV/Excel，按模板导入并回显校验错误行。','{\"apis\": [{\"path\": \"/api/{res}/export\", \"method\": \"GET\", \"comment\": \"按当前筛选导出 CSV\"}, {\"path\": \"/api/{res}/import\", \"method\": \"POST\", \"comment\": \"CSV 导入，逐行校验并汇总错误\"}], \"desc\": \"为每个业务模块生成 /api/{res}/export 与 /api/{res}/import，复用列表查询条件。\", \"config\": [{\"key\": \"format\", \"type\": \"select\", \"label\": \"导出格式\", \"default\": \"csv\", \"options\": [\"csv\", \"xlsx\"]}, {\"key\": \"maxRows\", \"type\": \"number\", \"label\": \"导入最大行\", \"default\": 5000}], \"verify\": [\"导出文件行数与列表筛选结果一致\"]}','2026-09-11 11:26:11'),(5,'batch','批量操作','☑️','data','1.0.1','多选批量删除/改状态/改负责人，带二次确认与影响条数预览。','{\"apis\": [{\"path\": \"/api/{res}/batch\", \"method\": \"POST\", \"comment\": \"批量动作，body={ids,action,value}\"}], \"desc\": \"为每个业务模块生成 /api/{res}/batch，支持 delete / status / assign 三种动作。\", \"config\": [{\"key\": \"confirm\", \"type\": \"switch\", \"label\": \"需要二次确认\", \"default\": true}], \"verify\": [\"勾选 3 条批量删除后列表总数 -3\"]}','2026-09-11 11:26:11'),(6,'tree','树形结构','🌲','data','1.1.0','任意模块升级为父子层级：物化 path + 拖拽改父级 + 递归下拉。','{\"apis\": [{\"path\": \"/api/{res}/tree\", \"method\": \"GET\", \"comment\": \"返回嵌套树\"}], \"desc\": \"给声明 tree=true 的模块注入 parent_id/path/level 列，生成 /api/{res}/tree 与树表格页面。\", \"config\": [{\"key\": \"maxLevel\", \"type\": \"number\", \"label\": \"最大层级\", \"default\": 5}], \"verify\": [\"树接口返回结构无环且根节点唯一\"], \"columns\": [{\"key\": \"parent_id\", \"name\": \"父级\", \"type\": \"int\", \"default\": 0, \"indexed\": true, \"formShow\": false, \"listShow\": false}, {\"key\": \"path\", \"name\": \"路径\", \"type\": \"varchar\", \"length\": 255, \"default\": \"/\", \"listShow\": false}, {\"key\": \"level\", \"name\": \"层级\", \"type\": \"int\", \"default\": 1, \"listShow\": false}]}','2026-09-11 11:26:11'),(7,'recycle','回收站','🗑️','data','1.0.0','软删除 + 还原 + 彻底清除，删除前展示关联影响。','{\"apis\": [{\"path\": \"/api/{res}/restore\", \"method\": \"POST\", \"comment\": \"还原软删记录\"}, {\"path\": \"/api/{res}/purge/:id\", \"method\": \"DELETE\", \"comment\": \"彻底删除\"}], \"desc\": \"业务表注入 deleted_at/deleted_by，列表查询默认过滤已删；生成回收站页与 /api/{res}/restore。\", \"config\": [{\"key\": \"purgeDays\", \"type\": \"number\", \"label\": \"超期自动清除(天)\", \"default\": 30}], \"verify\": [\"删除后记录进入回收站且可还原\"], \"columns\": [{\"key\": \"deleted_at\", \"name\": \"删除时间\", \"type\": \"datetime\", \"formShow\": false, \"listShow\": false}, {\"key\": \"deleted_by\", \"name\": \"删除人\", \"type\": \"varchar\", \"length\": 64, \"formShow\": false, \"listShow\": false}]}','2026-09-11 11:26:11'),(8,'dashboard','数据看板','📊','insight','1.4.0','首页指标卡 + 趋势图 + 占比图，聚合口径由建模站字段自动推导。','{\"apis\": [{\"path\": \"/api/dashboard/summary\", \"method\": \"GET\", \"comment\": \"首页聚合指标\"}], \"desc\": \"生成 /api/dashboard/summary，按模块的 int/decimal/datetime/enum 字段产出 count/sum/trend/group 指标。\", \"pages\": [{\"key\": \"dashboard\", \"icon\": \"📊\", \"name\": \"数据看板\", \"route\": \"/admin/dashboard\"}], \"config\": [{\"key\": \"trendDays\", \"type\": \"number\", \"label\": \"趋势天数\", \"default\": 30}, {\"key\": \"cards\", \"type\": \"number\", \"label\": \"指标卡数量\", \"default\": 4}], \"verify\": [\"看板指标与业务表 count(*) 一致\"]}','2026-09-11 11:26:11'),(9,'job','定时任务','⏰','system','1.0.0','cron 表达式调度内置任务，带执行日志与手动触发。','{\"apis\": [{\"path\": \"/api/job/run/:key\", \"method\": \"POST\", \"comment\": \"手动触发\"}], \"desc\": \"生成 sys_job / sys_job_log 表、调度器与任务管理页；任务实现写在 server/tasks/<key>.ts。\", \"pages\": [{\"key\": \"job\", \"icon\": \"⏰\", \"name\": \"定时任务\", \"route\": \"/admin/system/job\"}], \"config\": [{\"key\": \"timezone\", \"type\": \"text\", \"label\": \"调度时区\", \"default\": \"Asia/Shanghai\"}], \"tables\": [{\"name\": \"sys_job\", \"fields\": [{\"key\": \"id\", \"name\": \"主键\", \"type\": \"id\"}, {\"key\": \"job_key\", \"name\": \"任务编码\", \"type\": \"varchar\", \"length\": 64, \"unique\": true, \"required\": true}, {\"key\": \"name\", \"name\": \"任务名称\", \"type\": \"varchar\", \"length\": 64, \"required\": true}, {\"key\": \"cron\", \"name\": \"cron\", \"type\": \"varchar\", \"length\": 64, \"required\": true}, {\"key\": \"status\", \"name\": \"启用\", \"type\": \"bool\", \"default\": true}, {\"key\": \"last_run_at\", \"name\": \"上次执行\", \"type\": \"datetime\"}, {\"key\": \"last_result\", \"name\": \"上次结果\", \"type\": \"varchar\", \"length\": 255}], \"comment\": \"定时任务\"}, {\"name\": \"sys_job_log\", \"fields\": [{\"key\": \"id\", \"name\": \"主键\", \"type\": \"id\"}, {\"key\": \"job_key\", \"name\": \"任务编码\", \"type\": \"varchar\", \"length\": 64, \"indexed\": true}, {\"key\": \"status\", \"dict\": \"job_status\", \"name\": \"状态\", \"type\": \"enum\", \"length\": 16}, {\"key\": \"duration\", \"name\": \"耗时ms\", \"type\": \"int\"}, {\"key\": \"message\", \"name\": \"输出\", \"type\": \"text\"}, {\"key\": \"created_at\", \"name\": \"时间\", \"type\": \"datetime\"}], \"comment\": \"任务日志\"}], \"verify\": [\"手动触发后 sys_job_log 新增记录\"]}','2026-09-11 11:26:11'),(10,'message','站内消息','✉️','system','1.0.0','系统通知/待办中心，支持已读回执与角标。','{\"apis\": [{\"path\": \"/api/message/mine\", \"method\": \"GET\", \"comment\": \"我的消息\"}, {\"path\": \"/api/message/read/:id\", \"method\": \"POST\", \"comment\": \"标记已读\"}], \"desc\": \"生成 sys_message 表、顶栏铃铛角标与消息中心页；业务 hooks 可调用 pushMessage()。\", \"pages\": [{\"key\": \"message\", \"icon\": \"✉️\", \"name\": \"消息中心\", \"route\": \"/admin/system/message\"}], \"config\": [{\"key\": \"pollSeconds\", \"type\": \"number\", \"label\": \"角标轮询秒数\", \"default\": 60}], \"tables\": [{\"name\": \"sys_message\", \"fields\": [{\"key\": \"id\", \"name\": \"主键\", \"type\": \"id\"}, {\"key\": \"to_user\", \"name\": \"接收人\", \"type\": \"varchar\", \"length\": 64, \"indexed\": true}, {\"key\": \"title\", \"name\": \"标题\", \"type\": \"varchar\", \"length\": 128, \"required\": true}, {\"key\": \"content\", \"name\": \"正文\", \"type\": \"text\"}, {\"key\": \"kind\", \"dict\": \"msg_kind\", \"name\": \"类别\", \"type\": \"enum\", \"length\": 16}, {\"key\": \"is_read\", \"name\": \"已读\", \"type\": \"bool\", \"default\": false}, {\"key\": \"link\", \"name\": \"链接\", \"type\": \"varchar\", \"length\": 255}], \"comment\": \"站内消息\"}], \"verify\": [\"pushMessage 后角标 +1\"]}','2026-09-11 11:26:11'),(11,'flow','审批流','🧾','biz','0.9.0','线性多级审批：提交→逐级通过/驳回→归档，状态机可配置。','{\"apis\": [{\"path\": \"/api/{res}/flow\", \"method\": \"POST\", \"comment\": \"提交/通过/驳回，body={id,action,comment}\"}], \"desc\": \"业务表注入 flow_status/flow_node 列，生成 sys_flow_instance / sys_flow_history 与审批页。\", \"config\": [{\"key\": \"nodes\", \"type\": \"text\", \"label\": \"节点定义(逗号分隔)\", \"default\": \"提交,部门审核,终审\"}], \"tables\": [{\"name\": \"sys_flow_history\", \"fields\": [{\"key\": \"id\", \"name\": \"主键\", \"type\": \"id\"}, {\"key\": \"table_name\", \"name\": \"业务表\", \"type\": \"varchar\", \"length\": 64, \"indexed\": true}, {\"key\": \"row_id\", \"name\": \"业务主键\", \"type\": \"int\"}, {\"key\": \"node\", \"name\": \"节点\", \"type\": \"varchar\", \"length\": 64}, {\"key\": \"action\", \"dict\": \"flow_action\", \"name\": \"动作\", \"type\": \"enum\", \"length\": 16}, {\"key\": \"comment\", \"name\": \"意见\", \"type\": \"varchar\", \"length\": 512}, {\"key\": \"operator\", \"name\": \"操作人\", \"type\": \"varchar\", \"length\": 64}, {\"key\": \"created_at\", \"name\": \"时间\", \"type\": \"datetime\"}], \"comment\": \"审批轨迹\"}], \"verify\": [\"提交后状态由 draft 变为 pending\"], \"columns\": [{\"key\": \"flow_status\", \"dict\": \"flow_status\", \"name\": \"流程状态\", \"type\": \"enum\", \"length\": 16, \"default\": \"draft\"}, {\"key\": \"flow_node\", \"name\": \"当前节点\", \"type\": \"varchar\", \"length\": 64, \"listShow\": false}]}','2026-09-11 11:26:11'),(12,'i18n','多语言','🌐','ui','1.0.0','中/英/日三语，菜单与字段标签走语言包，可在线补译。','{\"deps\": [\"vue-i18n\"], \"desc\": \"生成 i18n/locales/{zh,en,ja}.ts，语言包 key 由模块与字段名自动产出，顶栏提供切换器。\", \"pages\": [], \"config\": [{\"key\": \"default\", \"type\": \"select\", \"label\": \"默认语言\", \"default\": \"zh\", \"options\": [\"zh\", \"en\", \"ja\"]}, {\"key\": \"switcher\", \"type\": \"switch\", \"label\": \"显示切换器\", \"default\": true}], \"verify\": [\"切换英文后菜单文案变化\"]}','2026-09-11 11:26:11'),(13,'security','安全加固','🛡️','ui','1.1.0','页面水印 + 登录失败锁定 + 密码强度策略 + 敏感字段脱敏。','{\"desc\": \"注入 v-watermark 指令、sys_login_attempt 表与登录限流；字段 rule=sensitive 时列表脱敏显示。\", \"config\": [{\"key\": \"watermark\", \"type\": \"switch\", \"label\": \"显示水印\", \"default\": true}, {\"key\": \"maxFails\", \"type\": \"number\", \"label\": \"最大失败次数\", \"default\": 5}, {\"key\": \"lockMinutes\", \"type\": \"number\", \"label\": \"锁定时长(分钟)\", \"default\": 15}], \"tables\": [{\"name\": \"sys_login_attempt\", \"fields\": [{\"key\": \"id\", \"name\": \"主键\", \"type\": \"id\"}, {\"key\": \"username\", \"name\": \"账号\", \"type\": \"varchar\", \"length\": 64, \"unique\": true}, {\"key\": \"fails\", \"name\": \"失败次数\", \"type\": \"int\", \"default\": 0}, {\"key\": \"locked_until\", \"name\": \"锁定至\", \"type\": \"datetime\"}], \"comment\": \"登录失败计数\"}], \"verify\": [\"连续错误登录后账号被临时锁定\"]}','2026-09-11 11:26:11'),(14,'print','单据打印','🖨️','biz','1.0.0','详情页一键生成打印视图，支持自定义表头与二维码。','{\"apis\": [{\"path\": \"/api/{res}/print/:id\", \"method\": \"GET\", \"comment\": \"打印数据快照\"}], \"desc\": \"为模块生成 /admin/{res}/print/:id 路由与打印样式，字段清单取设计站 detail 配置。\", \"pages\": [], \"config\": [{\"key\": \"qr\", \"type\": \"switch\", \"label\": \"显示二维码\", \"default\": true}], \"verify\": [\"打印页在无 CSS 框架下排版正确\"]}','2026-09-11 11:26:11'),(29,'landing_poster','推广海报与二码','📱','biz','1.0.0','极简 C 端落地页，支持渠道二码、参数接收、浏览量自动统计与营销海报展示。','{\"apis\": [{\"path\": \"/api/public/landing/:scene\", \"method\": \"GET\", \"comment\": \"免鉴权获取推广落地页与渠道信息\"}, {\"path\": \"/api/public/landing/scan\", \"method\": \"POST\", \"comment\": \"记录推广页浏览与扫码事件\"}], \"desc\": \"生成 /p/:scene 落地页与免鉴权 /api/public/landing 接口；后台列表自动增加“推广码”弹窗与复制链接。\", \"pages\": [{\"key\": \"landing_poster\", \"icon\": \"📱\", \"name\": \"推广落地页\", \"route\": \"/p/default\"}], \"config\": [{\"key\": \"heroTitle\", \"type\": \"text\", \"label\": \"落地页大标题\", \"default\": \"全渠道推广中心\"}, {\"key\": \"heroSubtitle\", \"type\": \"text\", \"label\": \"副标题/宣传语\", \"default\": \"扫码立即体验专属服务\"}, {\"key\": \"targetModel\", \"type\": \"text\", \"label\": \"绑定的渠道表编码\", \"default\": \"channel_qrcode\"}], \"verify\": [\"访问 /p/1 页面正常加载且返回渠道数据\", \"扫码接口正常回写统计数据\"]}','2026-09-14 17:43:12'),(30,'landing_form','动态线索收集表单','📋','biz','1.0.0','移动端自适应表单页，直接复用建模站实体字段与校验规则，免鉴权安全收集客户线索。','{\"apis\": [{\"path\": \"/api/public/submit/:model\", \"method\": \"POST\", \"comment\": \"免鉴权提交表单数据（带校验与频率保护）\"}], \"desc\": \"生成 /p/form 路由与 /api/public/submit/:model 接口；读取目标模型的字段定义自动渲染为 C 端高颜值表单。\", \"pages\": [{\"key\": \"landing_form\", \"icon\": \"📋\", \"name\": \"在线登记表单\", \"route\": \"/p/form\"}], \"config\": [{\"key\": \"targetModel\", \"type\": \"text\", \"label\": \"收集目标数据表编码\", \"default\": \"\"}, {\"key\": \"formTitle\", \"type\": \"text\", \"label\": \"表单主标题\", \"default\": \"在线业务申请登记\"}, {\"key\": \"submitText\", \"type\": \"text\", \"label\": \"提交按钮文案\", \"default\": \"立即提交\"}, {\"key\": \"successMsg\", \"type\": \"text\", \"label\": \"提交成功提示语\", \"default\": \"登记成功！我们将尽快与您联系。\"}], \"verify\": [\"提交 /api/public/submit 后目标数据表新增一条记录\"]}','2026-09-14 17:43:12'),(31,'landing_portal','前台复合门户','🏛️','ui','1.0.0','列表展示 + 详情卡片 + 底部留资表单的多功能前台门户，适配招聘、展品、活动等场景。','{\"apis\": [{\"path\": \"/api/public/portal/list\", \"method\": \"GET\", \"comment\": \"免鉴权分页拉取公开业务数据列表\"}, {\"path\": \"/api/public/portal/:id\", \"method\": \"GET\", \"comment\": \"免鉴权拉取单条业务详情\"}], \"desc\": \"生成 /portal 路由与 /api/public/portal 接口；上部卡片列表分页浏览，下部或悬浮窗支持即时表单提交。\", \"pages\": [{\"key\": \"landing_portal\", \"icon\": \"🏛️\", \"name\": \"前台服务门户\", \"route\": \"/portal\"}], \"config\": [{\"key\": \"listModel\", \"type\": \"text\", \"label\": \"展示列表的数据表编码\", \"default\": \"\"}, {\"key\": \"submitModel\", \"type\": \"text\", \"label\": \"提报表单的数据表编码\", \"default\": \"\"}, {\"key\": \"portalTitle\", \"type\": \"text\", \"label\": \"门户标题\", \"default\": \"服务咨询门户\"}], \"verify\": [\"访问 /portal 正常拉取业务列表数据并展示详情\"]}','2026-09-14 17:43:12'),(32,'landing_cms','纯静态企业官网与内容CMS','📰','ui','2.0.0','纯静态预渲染多页面品牌官网布局与CMS，零水合延迟/秒开无闪烁，内置Hero焦点屏、服务成效指标、核心优势矩阵、垂直专区、资讯发布与内联/独立双模阅读。','{\"apis\": [{\"path\": \"/api/public/cms/articles\", \"method\": \"GET\", \"comment\": \"免鉴权获取官网公开文章列表\"}, {\"path\": \"/api/public/cms/article/:id\", \"method\": \"GET\", \"comment\": \"免鉴权获取单篇官网文章正文\"}], \"desc\": \"生成 cms_article 表、后台文章管理页、纯静态 /cms 官网路由、纯静态 /cms/:id 详情路由与只读文章接口，预置高质感行业静态数据集，秒开零白屏。\", \"pages\": [{\"key\": \"landing_cms\", \"icon\": \"📰\", \"name\": \"纯静态官网首页\", \"route\": \"/cms\"}, {\"key\": \"cms_article\", \"icon\": \"📝\", \"name\": \"文章资讯管理\", \"route\": \"/admin/cms/article\"}], \"config\": [{\"key\": \"siteName\", \"type\": \"text\", \"label\": \"官网品牌名称\", \"default\": \"企业官方网站\"}, {\"key\": \"siteSlogan\", \"type\": \"text\", \"label\": \"品牌口号/标语\", \"default\": \"连接未来，赋能企业数字化\"}, {\"key\": \"contactPhone\", \"type\": \"text\", \"label\": \"客服咨询热线\", \"default\": \"400-888-9999\"}, {\"key\": \"contactEmail\", \"type\": \"text\", \"label\": \"商务联系邮箱\", \"default\": \"service@example.com\"}, {\"key\": \"address\", \"type\": \"text\", \"label\": \"办公或院区地址\", \"default\": \"高新科技产业园区数智创新大厦 18 层\"}, {\"key\": \"icp\", \"type\": \"text\", \"label\": \"网站备案号\", \"default\": \"京ICP备20260915号-1\"}], \"tables\": [{\"name\": \"cms_article\", \"fields\": [{\"key\": \"id\", \"name\": \"主键\", \"type\": \"id\"}, {\"key\": \"title\", \"name\": \"文章标题\", \"type\": \"varchar\", \"length\": 128, \"indexed\": true, \"required\": true}, {\"key\": \"category\", \"name\": \"栏目分类\", \"type\": \"varchar\", \"length\": 64, \"default\": \"新闻公告\"}, {\"key\": \"summary\", \"name\": \"摘要简介\", \"type\": \"varchar\", \"length\": 255}, {\"key\": \"cover\", \"name\": \"封面图\", \"type\": \"image\"}, {\"key\": \"content\", \"name\": \"正文内容\", \"type\": \"text\"}, {\"key\": \"views\", \"name\": \"浏览量\", \"type\": \"int\", \"default\": 0}, {\"key\": \"status\", \"name\": \"发布状态\", \"type\": \"bool\", \"default\": true}, {\"key\": \"created_at\", \"name\": \"发布时间\", \"type\": \"datetime\"}], \"comment\": \"官网文章资讯\"}], \"verify\": [\"访问 /cms 纯静态秒开无骨架屏\", \"支持内联抽屉与独立详情页查看资讯\", \"后台文章管理发布后可增量同步\"]}','2026-09-14 17:43:12');
/*!40000 ALTER TABLE `capability` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `casbin_rule`
--

DROP TABLE IF EXISTS `casbin_rule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `casbin_rule` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `ptype` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `v0` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `v1` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `v2` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `v3` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `v4` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `v5` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  KEY `idx_ptype` (`ptype`),
  KEY `idx_v0` (`v0`)
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `casbin_rule`
--

LOCK TABLES `casbin_rule` WRITE;
/*!40000 ALTER TABLE `casbin_rule` DISABLE KEYS */;
INSERT INTO `casbin_rule` VALUES (1,'g','user:1','super','main','','',''),(2,'p','role:super','*','*','*','',''),(3,'p','role:admin','main','/api/tenant/:id','*','',''),(4,'p','role:admin','main','/api/model/:id','*','',''),(5,'p','role:admin','main','/api/capability/:id','*','',''),(6,'p','role:admin','main','/api/design/:id','*','',''),(7,'p','role:admin','main','/api/logic/:id','*','',''),(8,'p','role:admin','main','/api/seed/:id','*','',''),(9,'p','role:admin','main','/api/gen/:id','*','',''),(10,'p','role:admin','main','/api/verify/:id','*','',''),(11,'p','role:admin','main','/api/ai/:id','*','',''),(12,'p','role:editor','main','/api/tenant/:id','get','',''),(13,'p','role:editor','main','/api/model/:id','get','',''),(14,'p','role:editor','main','/api/gen/:id','post','',''),(15,'p','role:viewer','main','/api/tenant/:id','get','',''),(16,'p','role:viewer','main','/api/model/:id','get','',''),(17,'p','role:viewer','main','/api/capability/:id','get','',''),(18,'g','user:2','editor','main','','',''),(19,'g','user:3','viewer','main','','','');
/*!40000 ALTER TABLE `casbin_rule` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `customer`
--

DROP TABLE IF EXISTS `customer`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `customer_real_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `level` bigint DEFAULT NULL,
  `time` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL,
  `created_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `flow_status` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT 'draft',
  `flow_node` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT '',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户管理';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customer`
--

LOCK TABLES `customer` WRITE;
/*!40000 ALTER TABLE `customer` DISABLE KEYS */;
/*!40000 ALTER TABLE `customer` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `dict_item`
--

DROP TABLE IF EXISTS `dict_item`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dict_item` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `type_id` int unsigned NOT NULL,
  `label` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `color` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT 'ok|warn|err，子后台标签配色',
  `sort` int NOT NULL DEFAULT '0',
  `enabled` tinyint NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_type_value` (`type_id`,`value`),
  KEY `idx_type` (`type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dict_item`
--

LOCK TABLES `dict_item` WRITE;
/*!40000 ALTER TABLE `dict_item` DISABLE KEYS */;
/*!40000 ALTER TABLE `dict_item` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `dict_type`
--

DROP TABLE IF EXISTS `dict_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dict_type` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int unsigned NOT NULL,
  `dict_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '字典编码，对应子后台 sys_dict_type.dict_key',
  `name` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '字典名称',
  `remark` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_key` (`tenant_id`,`dict_key`),
  KEY `idx_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dict_type`
--

LOCK TABLES `dict_type` WRITE;
/*!40000 ALTER TABLE `dict_type` DISABLE KEYS */;
/*!40000 ALTER TABLE `dict_type` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `gen_job`
--

DROP TABLE IF EXISTS `gen_job`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `gen_job` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int unsigned NOT NULL,
  `version` int NOT NULL DEFAULT '0',
  `kind` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'generate',
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'running',
  `message` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `git_commit` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `commit` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `log` mediumtext COLLATE utf8mb4_unicode_ci,
  `files_json` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `gen_job`
--

LOCK TABLES `gen_job` WRITE;
/*!40000 ALTER TABLE `gen_job` DISABLE KEYS */;
/*!40000 ALTER TABLE `gen_job` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `login_log`
--

DROP TABLE IF EXISTS `login_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `login_log` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `ok` tinyint NOT NULL DEFAULT '1',
  `ip` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `ua` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `login_log`
--

LOCK TABLES `login_log` WRITE;
/*!40000 ALTER TABLE `login_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `login_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `model_group`
--

DROP TABLE IF EXISTS `model_group`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `model_group` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int unsigned NOT NULL,
  `name` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `icon` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 0xF09F9381,
  `sort` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `model_group`
--

LOCK TABLES `model_group` WRITE;
/*!40000 ALTER TABLE `model_group` DISABLE KEYS */;
/*!40000 ALTER TABLE `model_group` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `module`
--

DROP TABLE IF EXISTS `module`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `module` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `group_id` int unsigned NOT NULL,
  `tenant_id` int unsigned NOT NULL,
  `name` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `res_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'camelCase resource key',
  `table_name` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `icon` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 0xF09F9384,
  `comment` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `sort` int NOT NULL DEFAULT '0',
  `design_json` json DEFAULT NULL COMMENT '设计站',
  `logic_json` json DEFAULT NULL COMMENT '逻辑站',
  `seed_json` json DEFAULT NULL COMMENT '数据站',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_group` (`group_id`),
  KEY `idx_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `module`
--

LOCK TABLES `module` WRITE;
/*!40000 ALTER TABLE `module` DISABLE KEYS */;
/*!40000 ALTER TABLE `module` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `module_field`
--

DROP TABLE IF EXISTS `module_field`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `module_field` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `module_id` int unsigned NOT NULL,
  `name` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'label',
  `col_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'column name',
  `type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `length` int NOT NULL DEFAULT '64',
  `precision` int NOT NULL DEFAULT '2',
  `nullable` tinyint NOT NULL DEFAULT '1',
  `uniq` tinyint NOT NULL DEFAULT '0',
  `indexed` tinyint NOT NULL DEFAULT '0',
  `pk` tinyint NOT NULL DEFAULT '0',
  `default_v` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dict_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `ref_table` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `ref_label` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `ref_value` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `component` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'input',
  `list_show` tinyint NOT NULL DEFAULT '1',
  `form_show` tinyint NOT NULL DEFAULT '1',
  `detail_show` tinyint NOT NULL DEFAULT '1',
  `export_show` tinyint NOT NULL DEFAULT '0',
  `sortable` tinyint NOT NULL DEFAULT '0',
  `clearable` tinyint NOT NULL DEFAULT '1',
  `query_type` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'eq' COMMENT 'none|eq|like|range|in',
  `query_hidden` tinyint NOT NULL DEFAULT '0',
  `required` tinyint NOT NULL DEFAULT '0',
  `rule` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `rule_msg` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `index_type` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',
  `remark` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `sort` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_module` (`module_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `module_field`
--

LOCK TABLES `module_field` WRITE;
/*!40000 ALTER TABLE `module_field` DISABLE KEYS */;
/*!40000 ALTER TABLE `module_field` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_dict_data`
--

DROP TABLE IF EXISTS `sys_dict_data`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_dict_data` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `dict_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `color` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort` int DEFAULT '0',
  `status` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `idx_sys_dict_data_dict_key` (`dict_key`)
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='字典项';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_dict_data`
--

LOCK TABLES `sys_dict_data` WRITE;
/*!40000 ALTER TABLE `sys_dict_data` DISABLE KEYS */;
INSERT INTO `sys_dict_data` VALUES (1,'status','启用','1','ok',0,1),(2,'status','停用','0','err',1,1),(3,'goods_status','甲','1','',0,1),(4,'goods_status','乙','2','',1,1),(5,'goods_status','丙','3','',2,1),(6,'file_kind','图片','image','',0,1),(7,'file_kind','文档','doc','',1,1),(8,'file_kind','其他','other','',2,1),(9,'job_status','成功','success','ok',0,1),(10,'job_status','失败','failed','err',1,1),(11,'msg_kind','通知','notice','',0,1),(12,'msg_kind','待办','todo','',1,1),(13,'flow_status','草稿','draft','',0,1),(14,'flow_status','审批中','pending','warn',1,1),(15,'flow_status','通过','approved','ok',2,1),(16,'flow_status','驳回','rejected','err',3,1),(17,'device_status','甲','1','',0,1),(18,'device_status','乙','2','',1,1),(19,'device_status','丙','3','',2,1);
/*!40000 ALTER TABLE `sys_dict_data` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_dict_type`
--

DROP TABLE IF EXISTS `sys_dict_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_dict_type` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `dict_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `dict_name` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `remark` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `dict_key` (`dict_key`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='字典类型';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_dict_type`
--

LOCK TABLES `sys_dict_type` WRITE;
/*!40000 ALTER TABLE `sys_dict_type` DISABLE KEYS */;
INSERT INTO `sys_dict_type` VALUES (1,'status','status',NULL),(2,'goods_status','goods_status',NULL),(3,'file_kind','file_kind',NULL),(4,'job_status','job_status',NULL),(5,'msg_kind','msg_kind',NULL),(6,'flow_status','flow_status',NULL),(7,'device_status','device_status',NULL);
/*!40000 ALTER TABLE `sys_dict_type` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_file`
--

DROP TABLE IF EXISTS `sys_file`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_file` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `store_key` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `size` int DEFAULT NULL,
  `mime` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `kind` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uploader` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `store_key` (`store_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文件';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_file`
--

LOCK TABLES `sys_file` WRITE;
/*!40000 ALTER TABLE `sys_file` DISABLE KEYS */;
/*!40000 ALTER TABLE `sys_file` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_flow_history`
--

DROP TABLE IF EXISTS `sys_flow_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_flow_history` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `table_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `row_id` int DEFAULT NULL,
  `node` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `comment` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `operator` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sys_flow_history_table_name` (`table_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审批轨迹';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_flow_history`
--

LOCK TABLES `sys_flow_history` WRITE;
/*!40000 ALTER TABLE `sys_flow_history` DISABLE KEYS */;
/*!40000 ALTER TABLE `sys_flow_history` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_job`
--

DROP TABLE IF EXISTS `sys_job`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_job` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `job_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cron` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` tinyint(1) DEFAULT '1',
  `last_run_at` datetime DEFAULT NULL,
  `last_result` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `job_key` (`job_key`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='定时任务';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_job`
--

LOCK TABLES `sys_job` WRITE;
/*!40000 ALTER TABLE `sys_job` DISABLE KEYS */;
INSERT INTO `sys_job` VALUES (1,'cleanup-logs','清理过期日志','15 3 * * *',1,NULL,NULL),(2,'heartbeat','心跳自检','* * * * *',1,'2026-09-11 15:27:08','在线，用户数 1');
/*!40000 ALTER TABLE `sys_job` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_job_log`
--

DROP TABLE IF EXISTS `sys_job_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_job_log` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `job_key` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duration` int DEFAULT NULL,
  `message` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sys_job_log_job_key` (`job_key`)
) ENGINE=InnoDB AUTO_INCREMENT=45 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务日志';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_job_log`
--

LOCK TABLES `sys_job_log` WRITE;
/*!40000 ALTER TABLE `sys_job_log` DISABLE KEYS */;
INSERT INTO `sys_job_log` VALUES (1,'heartbeat','success',1,'在线，用户数 1','2026-09-11 14:12:02'),(2,'heartbeat','success',1,'在线，用户数 1','2026-09-11 14:13:02'),(3,'heartbeat','success',1,'在线，用户数 1','2026-09-11 14:13:40'),(4,'heartbeat','success',1,'在线，用户数 1','2026-09-11 14:14:00'),(5,'heartbeat','success',1,'在线，用户数 1','2026-09-11 14:15:30'),(6,'heartbeat','success',1,'在线，用户数 1','2026-09-11 14:16:10'),(7,'heartbeat','success',1,'在线，用户数 1','2026-09-11 14:17:10'),(8,'heartbeat','success',1,'在线，用户数 1','2026-09-11 14:51:48'),(9,'heartbeat','success',1,'在线，用户数 1','2026-09-11 14:52:08'),(10,'heartbeat','success',1,'在线，用户数 1','2026-09-11 14:53:08'),(11,'heartbeat','success',1,'在线，用户数 1','2026-09-11 14:54:08'),(12,'heartbeat','success',1,'在线，用户数 1','2026-09-11 14:55:08'),(13,'heartbeat','success',1,'在线，用户数 1','2026-09-11 14:56:08'),(14,'heartbeat','success',2,'在线，用户数 1','2026-09-11 14:57:08'),(15,'heartbeat','success',1,'在线，用户数 1','2026-09-11 14:58:08'),(16,'heartbeat','success',1,'在线，用户数 1','2026-09-11 14:59:08'),(17,'heartbeat','success',2,'在线，用户数 1','2026-09-11 15:00:08'),(18,'heartbeat','success',0,'在线，用户数 1','2026-09-11 15:01:08'),(19,'heartbeat','success',1,'在线，用户数 1','2026-09-11 15:02:08'),(20,'heartbeat','success',0,'在线，用户数 1','2026-09-11 15:03:08'),(21,'heartbeat','success',1,'在线，用户数 1','2026-09-11 15:04:08'),(22,'heartbeat','success',0,'在线，用户数 1','2026-09-11 15:05:08'),(23,'heartbeat','success',0,'在线，用户数 1','2026-09-11 15:06:08'),(24,'heartbeat','success',1,'在线，用户数 1','2026-09-11 15:07:08'),(25,'heartbeat','success',1,'在线，用户数 1','2026-09-11 15:08:08'),(26,'heartbeat','success',0,'在线，用户数 1','2026-09-11 15:09:08'),(27,'heartbeat','success',1,'在线，用户数 1','2026-09-11 15:10:08'),(28,'heartbeat','success',0,'在线，用户数 1','2026-09-11 15:11:08'),(29,'heartbeat','success',1,'在线，用户数 1','2026-09-11 15:12:08'),(30,'heartbeat','success',1,'在线，用户数 1','2026-09-11 15:13:08'),(31,'heartbeat','success',1,'在线，用户数 1','2026-09-11 15:14:08'),(32,'heartbeat','success',0,'在线，用户数 1','2026-09-11 15:15:08'),(33,'heartbeat','success',0,'在线，用户数 1','2026-09-11 15:16:08'),(34,'heartbeat','success',0,'在线，用户数 1','2026-09-11 15:17:08'),(35,'heartbeat','success',1,'在线，用户数 1','2026-09-11 15:18:08'),(36,'heartbeat','success',0,'在线，用户数 1','2026-09-11 15:19:08'),(37,'heartbeat','success',1,'在线，用户数 1','2026-09-11 15:20:08'),(38,'heartbeat','success',1,'在线，用户数 1','2026-09-11 15:21:08'),(39,'heartbeat','success',1,'在线，用户数 1','2026-09-11 15:22:08'),(40,'heartbeat','success',0,'在线，用户数 1','2026-09-11 15:23:08'),(41,'heartbeat','success',1,'在线，用户数 1','2026-09-11 15:24:08'),(42,'heartbeat','success',1,'在线，用户数 1','2026-09-11 15:25:08'),(43,'heartbeat','success',1,'在线，用户数 1','2026-09-11 15:26:08'),(44,'heartbeat','success',1,'在线，用户数 1','2026-09-11 15:27:08');
/*!40000 ALTER TABLE `sys_job_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_login_attempt`
--

DROP TABLE IF EXISTS `sys_login_attempt`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_login_attempt` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fails` int NOT NULL DEFAULT '0',
  `locked_until` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='登录失败计数';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_login_attempt`
--

LOCK TABLES `sys_login_attempt` WRITE;
/*!40000 ALTER TABLE `sys_login_attempt` DISABLE KEYS */;
/*!40000 ALTER TABLE `sys_login_attempt` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_menu`
--

DROP TABLE IF EXISTS `sys_menu`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_menu` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `res_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `name` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `icon` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 0xF09F9384,
  `path` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `grp` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `perm` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `sort` int NOT NULL DEFAULT '0',
  `hidden` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='菜单';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_menu`
--

LOCK TABLES `sys_menu` WRITE;
/*!40000 ALTER TABLE `sys_menu` DISABLE KEYS */;
INSERT INTO `sys_menu` VALUES (1,'customer','客户','🤝','/admin/customer','默认分组','customer',0,0),(2,'goods','商品','📦','/admin/goods','业务管理','goods',1,0),(3,'dashboard','数据看板','📊','/admin/dashboard','系统管理','dashboard',2,0),(4,'dict','数据字典','📚','/admin/system/dict','系统管理','dict',3,0),(5,'log','操作日志','📝','/admin/system/log','系统管理','log',4,0);
/*!40000 ALTER TABLE `sys_menu` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_message`
--

DROP TABLE IF EXISTS `sys_message`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_message` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `to_user` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci,
  `kind` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `link` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sys_message_to_user` (`to_user`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='站内消息';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_message`
--

LOCK TABLES `sys_message` WRITE;
/*!40000 ALTER TABLE `sys_message` DISABLE KEYS */;
/*!40000 ALTER TABLE `sys_message` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_operation_log`
--

DROP TABLE IF EXISTS `sys_operation_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_operation_log` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `module` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payload` json DEFAULT NULL,
  `result` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duration` int DEFAULT '0',
  `ip` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sys_operation_log_username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='操作日志';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_operation_log`
--

LOCK TABLES `sys_operation_log` WRITE;
/*!40000 ALTER TABLE `sys_operation_log` DISABLE KEYS */;
INSERT INTO `sys_operation_log` VALUES (1,'admin','goods','create','/api/goods/remove','{\"ids\": [20]}','ok',9,'127.0.0.1','2026-09-11 14:06:09'),(2,'admin','goods','create','/api/goods/create','{\"price\": 1, \"title\": \"字典验证品\", \"status\": \"1\"}','ok',9,'127.0.0.1','2026-09-11 14:06:50'),(3,'admin','goods','create','/api/goods/remove','{\"ids\": [21]}','ok',7,'127.0.0.1','2026-09-11 14:06:59'),(4,'admin','goods','create','/api/goods/remove','{\"ids\": [19]}','ok',9,'127.0.0.1','2026-09-11 14:08:14'),(5,'admin','goods','create','/api/goods/create','{\"price\": 1, \"title\": \"字典验证品-1789106972263\", \"status\": \"1\"}','ok',6,'127.0.0.1','2026-09-11 14:09:32'),(6,'admin','goods','create','/api/goods/remove','{\"ids\": [23]}','ok',7,'127.0.0.1','2026-09-11 14:09:40'),(7,'admin','goods','create','/api/goods/remove','{\"ids\": [18]}','ok',9,'127.0.0.1','2026-09-11 14:14:35');
/*!40000 ALTER TABLE `sys_operation_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_user`
--

DROP TABLE IF EXISTS `sys_user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_user` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nickname` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `avatar` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `role` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'admin',
  `status` tinyint NOT NULL DEFAULT '1',
  `last_login_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='后台用户';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_user`
--

LOCK TABLES `sys_user` WRITE;
/*!40000 ALTER TABLE `sys_user` DISABLE KEYS */;
INSERT INTO `sys_user` VALUES (1,'admin','scrypt$aaa84b13bb1d6afa19d961732ef58dd3$7a7ca19bc3f2d8c4d90af91ab1d02557b43063562c0048882479e4952372722d62b3c0e278086d4bee40138c3d41e47f80cf970a0250a4a03f95615f2fb8ce2a','管理员','','admin',1,'2026-09-11 14:59:09','2026-09-11 12:48:17');
/*!40000 ALTER TABLE `sys_user` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tenant`
--

DROP TABLE IF EXISTS `tenant`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenant` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '[a-z0-9-]',
  `name` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `db_name` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `port` int NOT NULL,
  `jwt_secret` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft' COMMENT 'draft|generated|running|stopped|failed',
  `app_title` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `auth_mode` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `auth_config` json DEFAULT NULL,
  `theme_json` json DEFAULT NULL,
  `login_tpl` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'split',
  `layout` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'side',
  `version` int NOT NULL DEFAULT '0',
  `project_path` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `generated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tenant`
--

LOCK TABLES `tenant` WRITE;
/*!40000 ALTER TABLE `tenant` DISABLE KEYS */;
/*!40000 ALTER TABLE `tenant` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tenant_capability`
--

DROP TABLE IF EXISTS `tenant_capability`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenant_capability` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int unsigned NOT NULL,
  `cap_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `version` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `config_json` json DEFAULT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'installed',
  `installed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_cap` (`tenant_id`,`cap_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tenant_capability`
--

LOCK TABLES `tenant_capability` WRITE;
/*!40000 ALTER TABLE `tenant_capability` DISABLE KEYS */;
/*!40000 ALTER TABLE `tenant_capability` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user`
--

DROP TABLE IF EXISTS `user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nickname` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `avatar` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1=on 0=off',
  `last_login_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user`
--

LOCK TABLES `user` WRITE;
/*!40000 ALTER TABLE `user` DISABLE KEYS */;
INSERT INTO `user` VALUES (1,'admin','scrypt$042be0531fd56b433bf0f0a0aaa86c17$0d27bf9d20074ae0ca2cd8f1c786770932ca3ef94bdc60635156abf9feeef1bc7344ff7256fdd4941dfb6da0b1d974149637c2a79446331e3729ee4c4a562d33','超级管理员','',1,'2026-09-15 14:52:56','2026-09-11 11:26:11');
/*!40000 ALTER TABLE `user` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `verify_run`
--

DROP TABLE IF EXISTS `verify_run`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `verify_run` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int unsigned NOT NULL,
  `job_id` int unsigned DEFAULT NULL,
  `case_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pass',
  `detail` text COLLATE utf8mb4_unicode_ci,
  `duration` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `verify_run`
--

LOCK TABLES `verify_run` WRITE;
/*!40000 ALTER TABLE `verify_run` DISABLE KEYS */;
/*!40000 ALTER TABLE `verify_run` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-15 15:17:23
