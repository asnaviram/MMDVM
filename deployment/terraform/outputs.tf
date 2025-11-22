# VPC Outputs
output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.vpc.public_subnet_ids
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.vpc.private_subnet_ids
}

# Compute Outputs
output "roip_server_ids" {
  description = "RoIP server instance IDs"
  value       = module.compute.roip_server_ids
}

output "roip_server_public_ips" {
  description = "RoIP server public IP addresses"
  value       = module.compute.roip_server_public_ips
}

output "roip_server_private_ips" {
  description = "RoIP server private IP addresses"
  value       = module.compute.roip_server_private_ips
}

output "turn_server_ids" {
  description = "TURN server instance IDs"
  value       = module.compute.turn_server_ids
}

output "turn_server_public_ips" {
  description = "TURN server public IP addresses"
  value       = module.compute.turn_server_public_ips
}

# Database Outputs
output "db_endpoint" {
  description = "Database endpoint"
  value       = module.database.db_endpoint
  sensitive   = true
}

output "db_address" {
  description = "Database address"
  value       = module.database.db_address
}

output "db_port" {
  description = "Database port"
  value       = module.database.db_port
}

# Load Balancer Outputs
output "alb_dns_name" {
  description = "Application Load Balancer DNS name"
  value       = module.loadbalancer.alb_dns_name
}

output "alb_zone_id" {
  description = "Application Load Balancer zone ID"
  value       = module.loadbalancer.alb_zone_id
}

output "alb_arn" {
  description = "Application Load Balancer ARN"
  value       = module.loadbalancer.alb_arn
}

# S3 Outputs
output "backup_bucket_name" {
  description = "S3 backup bucket name"
  value       = aws_s3_bucket.backups.id
}

output "backup_bucket_arn" {
  description = "S3 backup bucket ARN"
  value       = aws_s3_bucket.backups.arn
}

# CloudWatch Outputs
output "log_group_name" {
  description = "CloudWatch log group name"
  value       = aws_cloudwatch_log_group.roip_logs.name
}

# IAM Outputs
output "instance_profile_name" {
  description = "IAM instance profile name"
  value       = aws_iam_instance_profile.roip_instance.name
}

output "instance_role_arn" {
  description = "IAM instance role ARN"
  value       = aws_iam_role.roip_instance.arn
}

# Connection Information
output "connection_info" {
  description = "Connection information for the deployment"
  value = {
    load_balancer_url = "https://${var.domain_name}"
    api_endpoint      = "https://${var.domain_name}/api"
    websocket_endpoint = "wss://${var.domain_name}/ws"
  }
}

# Deployment Summary
output "deployment_summary" {
  description = "Summary of deployed resources"
  value = {
    environment          = var.environment
    region              = var.aws_region
    roip_servers        = var.roip_server_count
    turn_servers        = var.turn_server_count
    database_multi_az   = var.db_multi_az
    backup_retention    = "${var.backup_retention_days} days"
  }
}
