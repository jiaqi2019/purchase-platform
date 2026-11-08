# Docker 部署

在本地或 CI 构建并推送镜像，服务器用 `docker compose pull` 拉取，再用 `docker compose up -d --wait` 启动。项目发布 `api` 和 `web` 两个镜像，MySQL 使用官方镜像。MySQL 数据和消费者照片分别保存在 `mysql_data` 和 `buyer_uploads` 卷中。

## 构建并推送镜像

在镜像仓库中准备一个 `purchase-platform` 仓库。如果使用 Docker Hub，且服务器为 `x86_64`，可以在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中添加变量 `DOCKERHUB_USERNAME` 和密钥 `DOCKERHUB_TOKEN`。密钥填写具有 **Read & Write** 权限的 Docker Hub 访问令牌。然后在 **Actions → Publish Docker images → Run workflow** 中填写版本号并运行。发布后，服务器 `.env` 的 `IMAGE_TAG` 填同一版本号，例如 `v1.0.0`。

手动构建时，在项目根目录执行以下命令，将域名和仓库路径换成实际地址。按服务器架构选择 `linux/amd64`（`x86_64`）或 `linux/arm64`（`aarch64`），每次发布使用新版本号。构建机需要访问镜像仓库、Debian 软件源、`registry.npmmirror.com` 和 Prisma 下载服务。[Docker Buildx 文档](https://docs.docker.com/reference/cli/docker/buildx/build/)

```bash
docker login registry.example.com
image_repo=registry.example.com/team/purchase-platform
image_tag=v1.0.0
platform=linux/amd64

docker buildx build --platform "$platform" --target api \
  --tag "$image_repo:${image_tag}-api" --push .
docker buildx build --platform "$platform" --target web \
  --tag "$image_repo:${image_tag}-web" --push .
```

## 服务器首次启动

安装 Docker Engine 和 Compose 插件。将 `compose.yaml` 和 `.env.docker.example` 复制到服务器的部署目录。Caddy 配置已打包到 `web` 镜像中。使用私有仓库时，先在服务器上执行 `docker login`。[Ubuntu 安装步骤](https://docs.docker.com/engine/install/ubuntu/)

在服务器的部署目录执行以下命令。将上一步的仓库地址和版本号填到 `.env` 的 `IMAGE_REPOSITORY` 和 `IMAGE_TAG`。分别运行三次 `openssl rand -hex 32`，将结果填入 `MYSQL_PASSWORD`、`MYSQL_ROOT_PASSWORD` 和 `INTERNAL_JOB_TOKEN`。使用十六进制值可以避免 MySQL 连接串的转义问题。

```bash
test -f .env || (umask 077 && cp .env.docker.example .env)
chmod 600 .env
openssl rand -hex 32
```

```bash
docker compose pull && docker compose up -d --wait db
```

全新空库用以下命令建表。若已有业务数据，按[数据恢复](#数据恢复)导入后再启动应用。

```bash
docker compose run --rm --no-deps api npm run db:push -- --skip-generate
# 可选，写入初始商品分类与生日提醒设置
docker compose run --rm --no-deps api npm run db:seed
```

```bash
docker compose up -d --wait
docker compose ps
curl -fsS --retry 8 --retry-connrefused --retry-delay 1 \
  'http://127.0.0.1:8080/api/buyers?page=1&pageSize=1' >/dev/null
```

默认入口绑定服务器的 `127.0.0.1:8080`。在自己电脑上执行下列命令，将 `deploy` 和 `SERVER_IP` 换成实际的 SSH 用户与地址，保持终端连接，然后打开 `http://127.0.0.1:8080/`。默认模式下，云安全组只需向允许的来源开放 SSH。

```bash
ssh -N -L 8080:127.0.0.1:8080 deploy@SERVER_IP
```

## 通过域名访问

这套配置适用于少数可信成员。通过入口认证的成员有相同的业务权限。需要按账号授权或记录操作时，应接入组织身份网关或在应用内实现对应能力。

1. 将域名解析到服务器，在安全组开放 TCP `80` 和 `443` 给 Caddy。Caddy 会自动申请和续签证书。[Caddy 自动 HTTPS](https://caddyserver.com/docs/automatic-https)
2. 用 `docker compose -f compose.yaml run --rm --no-deps web caddy hash-password` 交互生成密码哈希。在 `.env` 填写 `SITE_DOMAIN`、`SITE_USER` 和 `SITE_PASSWORD_HASH`。`SITE_DOMAIN` 填纯域名，哈希用单引号包起来，例如 `SITE_PASSWORD_HASH='$2a$14$...'`。
3. 将 `compose.public.yaml` 复制到同一部署目录，使用 Compose 2.24.4 或更新版本启用公网配置。[Compose 覆盖规则](https://docs.docker.com/reference/compose-file/merge/#replace-value)

   ```bash
   docker compose -f compose.yaml -f compose.public.yaml up -d --wait
   ```

访问 `https://你的域名` 应出现登录提示。未提供凭据的 `/api/buyers` 请求应返回 `401`。公网模式下，后续 Compose 命令也使用同样的两个 `-f` 参数。

两种模式都拦截 `/api/internal/*`，包括用于清空数据的接口。页面上的“手动执行任务”因此无法调用，自动生日提醒仍在北京时间每天 00:00 运行。

## 数据恢复

迁移时先暂停旧实例写入，用 `mysqldump` 导出 `purchase_platform`，并归档原实例 `uploads` 目录里的内容。从工作区启动后端时，该目录通常是 `server/uploads`。归档中的 `buyers/` 应位于顶层。把两份文件放到新服务器项目的 `backups/`，在目标 MySQL 启动且未建表时恢复。

```bash
docker compose exec -T db sh -c \
  'exec mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  < backups/purchase-platform.sql
docker compose run --rm --no-deps -T api tar -xzf - -C /app/server/uploads \
  < backups/buyer-uploads.tar.gz
```

旧实例没有照片时，跳过解包。启动后抽查业务列表、库存和历史照片，再切换访问入口。

## 备份和更新

短暂停止应用，保留数据库运行，然后备份数据库和照片。若已经启用公网配置，给以下 `docker compose` 命令加上对应的两个 `-f` 参数。

```bash
umask 077
mkdir -p backups
backup_dir=$(mktemp -d backups/snapshot-XXXXXXXX)
docker compose stop web api
docker compose exec -T db sh -c \
  'exec mysqldump --single-transaction --no-tablespaces -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  > "$backup_dir/purchase-platform.sql"
docker compose run --rm --no-deps -T api tar -C /app/server/uploads -czf - . \
  > "$backup_dir/buyer-uploads.tar.gz"
docker compose up -d --wait
```

每次备份后，将数据库和照片归档一起转存到受控的异地存储并验证可恢复。`docker compose down -v` 会删除 Compose 数据卷。

数据库结构未变时，在本地或 CI 推送两个新版本的镜像，然后在服务器原部署目录修改 `.env` 的 `IMAGE_TAG`，执行以下命令。保留原部署目录和 Compose 项目名，以继续使用现有数据卷。

```bash
docker compose pull api web && docker compose up -d --wait
```

仓库当前没有 Prisma 迁移文件。涉及改表的发布要先备份，再补齐并审核迁移。给已有库建立迁移基线后，后续改表使用 `prisma migrate deploy`。[Prisma 迁移基线](https://docs.prisma.io/docs/orm/v6/prisma-migrate/workflows/baselining)

上传照片遇到 `413` 时，检查 Koa 的 JSON 请求体大小限制。原图以 Base64 放入 JSON，支持完整的 5 MiB 原图需要将 `bodyParser` 的 `jsonLimit` 调到 `8mb` 并重建 `api`。如果前面还有代理，也检查代理的请求体限制。
