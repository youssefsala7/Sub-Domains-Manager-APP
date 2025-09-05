import { Document, Types } from 'mongoose';
import { Request } from 'express';

export interface IUser extends Document {
	email: string;
	password: string;
	name: string;
	role: 'admin' | 'user';
	createdAt: Date;
	comparePassword(candidatePassword: string): Promise<boolean>;
}

export interface ILink {
	title: string;
	url: string;
	icon: string;
	order: number;
}

export interface ICustomization {
	backgroundColor?: string;
	textColor?: string;
	buttonStyle?: string;
	font?: string;
}

export interface IClient extends Document {
	name: string;
	subdomain: string;
	description: string;
	theme: string;
	links: ILink[];
	owner: Types.ObjectId;
	isActive: boolean;
	isDeployed: boolean;
	customization: ICustomization;
	logo?: string;
	deploymentType: 'template' | 'custom-html';
	htmlCode?: string;
	createdAt: Date;
	lastUpdated: Date;
}

export interface AuthRequest extends Request {
	user?: {
		userId: string;
	};
}
