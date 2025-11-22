terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Optional: Use remote backend for state
  # backend "s3" {
  #   bucket = "roip-terraform-state"
  #   key    = "production/terraform.tfstate"
  #   region = "us-east-1"
  #   encrypt = true
  #   dynamodb_table = "terraform-lock"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "RoIP"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# VPC Module
module "vpc" {
  source = "./modules/vpc"

  environment         = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
  public_subnets     = var.public_subnets
  private_subnets    = var.private_subnets
  database_subnets   = var.database_subnets
}

# Compute Module (EC2 instances)
module "compute" {
  source = "./modules/compute"

  environment        = var.environment
  vpc_id            = module.vpc.vpc_id
  public_subnet_ids = module.vpc.public_subnet_ids
  private_subnet_ids = module.vpc.private_subnet_ids

  instance_type      = var.instance_type
  key_name          = var.key_name
  ami_id            = var.ami_id

  roip_server_count  = var.roip_server_count
  turn_server_count  = var.turn_server_count

  db_security_group_id = module.database.db_security_group_id
}

# Database Module (RDS PostgreSQL)
module "database" {
  source = "./modules/database"

  environment          = var.environment
  vpc_id              = module.vpc.vpc_id
  database_subnet_ids = module.vpc.database_subnet_ids

  db_instance_class    = var.db_instance_class
  db_allocated_storage = var.db_allocated_storage
  db_name             = var.db_name
  db_username         = var.db_username
  db_password         = var.db_password

  backup_retention_period = var.db_backup_retention_period
  multi_az               = var.db_multi_az

  allowed_security_group_ids = [module.compute.roip_server_security_group_id]
}

# Load Balancer Module
module "loadbalancer" {
  source = "./modules/loadbalancer"

  environment       = var.environment
  vpc_id           = module.vpc.vpc_id
  public_subnet_ids = module.vpc.public_subnet_ids

  certificate_arn   = var.certificate_arn
  domain_name      = var.domain_name

  roip_server_ids   = module.compute.roip_server_ids
}

# S3 Bucket for backups and recordings
resource "aws_s3_bucket" "backups" {
  bucket = "${var.environment}-roip-backups"

  tags = {
    Name = "${var.environment}-roip-backups"
  }
}

resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    id     = "delete-old-backups"
    status = "Enabled"

    expiration {
      days = var.backup_retention_days
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "roip_logs" {
  name              = "/aws/roip/${var.environment}"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "${var.environment}-roip-logs"
  }
}

# Route53 DNS (optional)
resource "aws_route53_record" "roip" {
  count   = var.create_dns_records ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = module.loadbalancer.alb_dns_name
    zone_id                = module.loadbalancer.alb_zone_id
    evaluate_target_health = true
  }
}

# IAM Role for EC2 instances
resource "aws_iam_role" "roip_instance" {
  name = "${var.environment}-roip-instance-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "roip_instance_ssm" {
  role       = aws_iam_role.roip_instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "roip_instance_s3" {
  name = "${var.environment}-roip-instance-s3-policy"
  role = aws_iam_role.roip_instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.backups.arn,
          "${aws_s3_bucket.backups.arn}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_instance_profile" "roip_instance" {
  name = "${var.environment}-roip-instance-profile"
  role = aws_iam_role.roip_instance.name
}
