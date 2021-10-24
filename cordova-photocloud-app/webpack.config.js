const path = require('path');
var HtmlWebpackPlugin = require('html-webpack-plugin');
const { VueLoaderPlugin } = require('vue-loader')
const BrotliPlugin = require('brotli-webpack-plugin')
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const autoprefixer = require('autoprefixer');

const _ = require("lodash");
module.exports = (env = {}) => {
    return {
        mode: env.prod ? 'production' : 'development',
        entry: './src/index.ts',
        output: {
            path: path.resolve(__dirname, 'www'),
            filename: '[name].[contenthash].js',
        },
        optimization: {
            runtimeChunk: 'single',
            moduleIds: 'hashed',
            splitChunks: {
                cacheGroups: {
                    vendor: {
                        test: /[\\/]node_modules[\\/]/,
                        name: 'vendors',
                        chunks: 'all',
                    },
                },
            },
        },
        plugins: _.concat([
            new HtmlWebpackPlugin({
                template: "src/index.html",
                // favicon: "src/img/faviconpng.png",
                inject: true,
            }),
            new VueLoaderPlugin(),
        ],
            env.prod ? [
                new CleanWebpackPlugin(),
                new BrotliPlugin({
                    asset: '[path].br[query]',
                    test: /\.(js|css|html|svg)$/,
                    threshold: 10240,
                    minRatio: 0.8
                })
            ] : []
        ),
        resolve: {
            extensions: ['.ts', '.js', '.jsx', '.tsx', '.css', 'scsss'],
            alias: {
                'vue': 'vue/dist/vue.runtime.esm-bundler.js'
            },
        },
        module: {
            rules: [
                {
                    test: /\.vue$/,
                    loader: "vue-loader",
                },
                {
                    test: /\.tsx?$/,
                    loader: "ts-loader",
                    options: { appendTsSuffixTo: [/\.vue$/] }
                },
                {
                    test: /\.less$/,
                    exclude: [/node_modules/],
                    use: ['style-loader', 'css-loader', 'less-loader']
                },
                {
                    test: /\.s(a|c)ss$/,
                    exclude: [/node_modules/],
                    use: ['style-loader', 'css-loader',
                        // Only need saas-loader for freeconomy but need postcss and sass option for material :
                        // https://github.com/material-components/material-components-web/blob/master/docs/getting-started.md
                        {
                            loader: 'postcss-loader',
                            options: {
                                plugins: () => [autoprefixer()]
                            }
                        },
                        {
                            loader: 'sass-loader',
                            options: {
                                // Prefer Dart Sass
                                implementation: require('sass'),

                                // See https://github.com/webpack-contrib/sass-loader/issues/804
                                webpackImporter: false,
                                sassOptions: {
                                    includePaths: ['./node_modules']
                                },
                            },
                        }]
                },
                // Used to import material web components javascript
                // https://github.com/material-components/material-components-web/blob/master/docs/getting-started.md
                {
                    test: /\.js$/,
                    loader: 'babel-loader',
                    query: {
                        presets: ['@babel/preset-env'],
                    },
                },
                // {
                //     test: /\.css$/,
                //     use: ['style-loader',
                //     { loader: 'css-loader', options: { importLoaders: 1 } }]
                // },
                {
                    test: /\.(gif|jpe?g|png|svg|woff|woff2|eot|ttf)$/,
                    use: {
                        loader: 'url-loader',
                        options: {
                            name: '[name].[ext]',
                            esModule: false,
                        }
                    }
                },
            ]
        },
        devtool: env.prod ? "" : 'inline-source-map',
    }
};
